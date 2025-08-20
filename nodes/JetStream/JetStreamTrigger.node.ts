import {
	IDataObject,
	IExecuteResponsePromiseData,
	INodeType,
	INodeTypeDescription,
	IRun,
	ITriggerFunctions,
	ITriggerResponse,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

import Container from 'typedi';
import { NatsService } from '../Nats.service';
import { AckPolicy } from 'nats';
import { createNatsNodeMessage, NatsNodeMessageOptions } from '../Nats/actions/NATS';

export class JetStreamTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NATS - JetStream Trigger',
		name: 'jetStreamTrigger',
		icon: 'file:jetstream.svg',
		group: ['trigger'],
		version: 1,
		description: 'Consumer JetStream stream message',
		eventTriggerDescription: '',
		defaults: {
			name: 'JetStream Trigger',
		},
		triggerPanel: {
			header: '',
			executionsHelp: {
				inactive:
					"<b>While building your workflow</b>, click the 'listen' button, then trigger a JetStream stream message. This will trigger an execution, which will show up in this editor.<br /> <br /><b>Once you're happy with your workflow</b>, <a data-key='activate'>activate</a> it. Then every time a change is detected, the workflow will execute. These executions will show up in the <a data-key='executions'>executions list</a>, but not in the editor.",
				active:
					"<b>While building your workflow</b>, click the 'listen' button, then trigger a JetStream stream message. This will trigger an execution, which will show up in this editor.<br /> <br /><b>Your workflow will also execute automatically</b>, since it's activated. Every time a change is detected, this node will trigger an execution. These executions will show up in the <a data-key='executions'>executions list</a>, but not in the editor.",
			},
			activationHint:
				"Once you’ve finished building your workflow, <a data-key='activate'>activate</a> it to have it also listen continuously (you just won’t see those executions here).",
		},
		inputs: [],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'natsApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Stream',
				name: 'stream',
				type: 'string',
				default: '',
				placeholder: 'stream',
				description: 'The name of the stream',
			},
			{
				displayName: 'Auto-create Ephemeral Consumer',
				name: 'autoCreateEphemeralConsumer',
				type: 'boolean',
				default: false,
				description:
					"Whether to automatically create an ephemeral pull consumer if the specified consumer doesn't exist or no name is provided.",
			},
			{
				displayName: 'Consumer Name (Durable Only)',
				name: 'consumer',
				type: 'string',
				default: '',
				placeholder: 'consumer',
				description: 'The name of the existing, durable consumer',
				displayOptions: {
					show: {
						autoCreateEphemeralConsumer: [false],
					},
				},
			},
			{
				displayName: 'Filter Subject (Ephemeral Only)',
				name: 'filterSubject',
				type: 'string',
				default: '',
				placeholder: 'e.g. orders.*',
				description:
					'Optional subject filter applied when auto-creating an ephemeral consumer (wildcards allowed).',
				displayOptions: {
					show: {
						autoCreateEphemeralConsumer: [true],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Content Is Binary',
						name: 'contentIsBinary',
						type: 'boolean',
						default: false,
						description: 'Whether to save the content as binary',
					},
					{
						displayName: 'Message Acknowledge When',
						name: 'acknowledge',
						type: 'options',
						options: [
							{
								name: 'Execution Finishes',
								value: 'executionFinishes',
								description:
									'After the workflow execution finished. No matter if the execution was successful or not.',
							},
							{
								name: 'Execution Finishes Successfully',
								value: 'executionFinishesSuccessfully',
								description: 'After the workflow execution finished successfully',
							},
							{
								name: 'Immediately',
								value: 'immediately',
								description: 'As soon as the message got received',
							},
							{
								name: 'Specified Later in Workflow',
								value: 'laterMessageNode',
								description: 'Using a NATS - JetStream node to remove the item from the queue',
							},
						],
						default: 'immediately',
						description: 'When to acknowledge the message',
					},
					{
						displayName: 'Only Content',
						name: 'onlyContent',
						type: 'boolean',
						default: false,
						description: 'Whether to return only the content property',
					},
					{
						displayName: 'Parallel Message Processing Limit',
						name: 'parallelMessages',
						type: 'number',
						default: -1,
						description: 'Max number of executions at a time. Use -1 for no limit.',
					},
				],
			},
			{
				displayName:
					"To acknowledge an message from the consumer, insert a NATS - JetStream node later in the workflow and use the 'Acknowledge Message' operation",
				name: 'laterMessageNode',
				type: 'notice',
				displayOptions: {
					show: {
						'/options.acknowledge': ['laterMessageNode'],
					},
				},
				default: '',
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		const stream = this.getNodeParameter('stream') as string;
		const consumer = this.getNodeParameter('consumer', '') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject & NatsNodeMessageOptions;
		const autoCreateEphemeralConsumer = this.getNodeParameter(
			'autoCreateEphemeralConsumer',
			false,
		) as boolean;
		const filterSubject = this.getNodeParameter('filterSubject', '') as string;

		let parallelMessages =
			options.parallelMessages !== undefined && options.parallelMessages !== -1
				? parseInt(options.parallelMessages as string, 10)
				: -1;

		if (parallelMessages === 0 || parallelMessages < -1) {
			throw new NodeOperationError(
				this.getNode(),
				'Parallel message processing limit must be greater than zero (or -1 for no limit)',
			);
		}

		if (this.getMode() === 'manual') {
			parallelMessages = 1;
		}

		let acknowledgeMode = options.acknowledge ? options.acknowledge : 'immediately';

		const nats = await Container.get(NatsService).getJetStream(this);

		let consumerName = (consumer || '').trim();
		let ephemeralCreated = false;
		let jsm: Awaited<ReturnType<typeof nats.connection.jetstreamManager>> | undefined;

		// If durable mode is selected (no auto-create), a consumer name must be provided
		if (!autoCreateEphemeralConsumer && consumerName === '') {
			throw new NodeOperationError(
				this.getNode(),
				"Consumer name is required when using a durable consumer. Either provide a 'Consumer Name' or enable 'Auto-create Ephemeral Consumer'.",
			);
		}

		if (autoCreateEphemeralConsumer) {
			try {
				if (consumerName) {
					await nats.js.consumers.get(stream, consumerName);
				} else {
					throw new Error('no-consumer-provided');
				}
			} catch (_) {
				jsm = await nats.connection.jetstreamManager();
				const cfg: any = {
					// create a pull consumer with explicit ack
					ack_policy: AckPolicy.Explicit,
				};
				if (filterSubject && filterSubject.trim() !== '') {
					cfg.filter_subject = filterSubject.trim();
				}
				const ci = await jsm.consumers.add(stream, cfg);
				consumerName = ci.name;
				ephemeralCreated = true;
			}
		}

		const jsConsumer = await nats.js.consumers.get(stream, consumerName);
		const messages = await jsConsumer.consume({ max_messages: parallelMessages });

		const consume = async () => {
			for await (const message of messages) {
				message.working();
				if (acknowledgeMode === 'immediately') {
					await message.ackAck();
				}
				try {
					this.helpers;
					const item = await createNatsNodeMessage(this, message, undefined, options);

					if (
						acknowledgeMode === 'executionFinishes' ||
						acknowledgeMode === 'executionFinishesSuccessfully'
					) {
						const responsePromise = await this.helpers.createDeferredPromise<IRun>();
						this.emit([this.helpers.returnJsonArray([item])], undefined, responsePromise);
						const data = await responsePromise.promise;
						if (
							(!data.data.resultData.error &&
								acknowledgeMode === 'executionFinishesSuccessfully') ||
							acknowledgeMode === 'executionFinishes'
						) {
							await message.ackAck();
						} else if (
							data.data.resultData.error &&
							acknowledgeMode === 'executionFinishesSuccessfully'
						) {
							message.nak();
							this.emitError(data.data.resultData.error);
						}
					} else if (acknowledgeMode === 'laterMessageNode') {
						const responsePromiseHook =
							await this.helpers.createDeferredPromise<IExecuteResponsePromiseData>();
						this.emit([this.helpers.returnJsonArray([item])], responsePromiseHook);
						await responsePromiseHook.promise;
						await message.ackAck();
					} else {
						this.emit([this.helpers.returnJsonArray([item])]);
					}
				} catch (error) {
					if (acknowledgeMode !== 'immediately') {
						message.nak();
					}
					this.emitError(error);
				}
			}
		};
		consume();

		const closeFunction = async () => {
			await messages.close(); //todo error handling
			// If we created an ephemeral consumer, try to delete it
			if (ephemeralCreated) {
				try {
					const m = jsm ?? (await nats.connection.jetstreamManager());
					await m.consumers.delete(stream, consumerName);
				} catch (e) {
					// ignore cleanup errors
				}
			}
			nats[Symbol.dispose]();
		};

		return {
			closeFunction,
		};
	}
}
