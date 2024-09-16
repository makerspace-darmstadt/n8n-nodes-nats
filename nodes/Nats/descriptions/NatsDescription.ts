import type { INodeProperties } from 'n8n-workflow';

export const natsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		default: 'publish',
		noDataExpression: true,
		options: [
			{
				name: 'Publish',
				value: 'publish',
				description: 'Publish in a subject',
				action: 'Publish in a subject',
			},
			{
				name: 'Request',
				value: 'request',
				description: 'Request on a subject',
				action: 'Request on a subject',
			},
		],
	},
];


export const natsDescription: INodeProperties[] = [
	/* -------------------------------------------------------------------------- */
	/*                               nats:publish                                 */
	/* -------------------------------------------------------------------------- */
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		placeholder: 'Subject',
		required: true,
		displayOptions: {
			//show: {
				//operation: ['publish', 'request'],
			//},
		},
	},
	{
		displayName: 'Payload Content Type',
		name: 'contentType',
		type: 'options',
		options: [
			{
				name: 'String',
				value: 'string',
			},
			{
				name: 'N8n Binary Data',
				value: 'binaryData',
			},
		],
		default: 'string',
		description: 'Content type for the payload',
	},
	{
		displayName: 'Payload',
		name: 'payload',
		type: 'string',
		default: '',
		placeholder: 'Payload',
		displayOptions: {
			show: {
				//operation: ['publish'],
				contentType: ['string'],
			},
		},
	},
	{
		displayName: 'Payload Binary Property Name',
		name: 'payloadBinaryPropertyName',
		type: 'string',
		default: '',
		placeholder: 'data',
		displayOptions: {
			show: {
				//operation: ['publish'],
				contentType: ['binaryData'],
			},
		},
	},
	{
		displayName: 'Headers',
		name: 'headersUi',
		placeholder: 'Add Header',
		type: 'fixedCollection',
		displayOptions: {
			// show: {
			// 	operation: ['publish'],
			// },
		},
		typeOptions: {
			multipleValues: true,
		},
		default: {},
		options: [
			{
				name: 'headerValues',
				displayName: 'Header',
				values: [
					{
						displayName: 'Key',
						name: 'key',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
		]
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
				displayName: 'JSON Parse Body',
				name: 'jsonParseBody',
				type: 'boolean',
				default: false,
				description: 'Whether to parse the body to an object',
			},
			{
				displayName: 'Max Replies',
				name: 'replies',
				type: 'number',
				default: false,
				description: 'Max replies from service',
			},
			{
				displayName: 'Only Content',
				name: 'onlyContent',
				type: 'boolean',
				default: false,
				description: 'Whether to return only the content property',
			},
			{
				displayName: 'Request Many',
				name: 'requestMany',
				type: 'boolean',
				default: false,
				description: 'Whether to request multiple replies from services',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				default: false,
				description: 'Maximum timeout between incoming replies',
			},
		]
	},
];
