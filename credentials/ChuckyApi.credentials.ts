import {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class ChuckyApi implements ICredentialType {
  name = 'chuckyApi';
  displayName = 'Chucky API';
  documentationUrl = 'https://docs.chucky.cloud/authentication';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'Your Chucky API key (starts with ak_live_)',
    },
  ];

  // How to authenticate requests
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '={{"Bearer " + $credentials.apiKey}}',
      },
    },
  };

  // Test credentials by listing projects (requires valid API key)
  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://doting-hornet-490.convex.site',
      url: '/api/projects',
    },
  };
}
