import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

import { natsDescription, natsOperations } from './descriptions';

import { natsCredTest } from '../common';

import * as Actions from './actions';
import Container from 'typedi';
import { NatsService } from '../Nats.service';

export class Nats implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'NATS',
		name: 'nats',
		icon: 'file:nats.svg',
		group: ['output'],
		version: 1,
		description: 'NATS',
		subtitle: '={{"nats: " + $parameter["operation"]}}',
		defaults: {
			name: 'NATS',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'natsApi',
				required: true,
				testedBy: 'natsCredTest',
			},
		],
		properties: [...natsOperations, ...natsDescription],
	};

	methods = {
		credentialTest: {
			natsCredTest,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		let items = this.getInputData();

		const operation = this.getNodeParameter('operation', 0);

		using nats = await Container.get(NatsService).getConnection(this);

		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				await (Actions.nats as any)[operation](this, nats.connection, itemIndex, returnData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ pairedItem: itemIndex, json: { error: error.message } });
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}
		return this.prepareOutputData(returnData);
	}
}
