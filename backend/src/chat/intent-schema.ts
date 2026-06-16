import type { ResponseFormatJSONSchema } from 'openai/resources/shared';

export const CHAT_INTENT_RESPONSE_FORMAT: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'filmott_chat_intent',
    description: '영화/시리즈 추천 요청에서 검색 조건과 확신도를 추출합니다.',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: [
        'ottProviderNames',
        'countries',
        'excludeCountries',
        'personNames',
        'referenceTitles',
        'dateRange',
        'contentType',
        'genres',
        'confidence',
      ],
      properties: {
        ottProviderNames: {
          type: 'array',
          items: { type: 'string' },
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
        },
        excludeCountries: {
          type: 'array',
          items: { type: 'string' },
        },
        personNames: {
          type: 'array',
          items: { type: 'string' },
        },
        referenceTitles: {
          type: 'array',
          items: { type: 'string' },
        },
        dateRange: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['from', 'to'],
              properties: {
                from: { type: ['string', 'null'] },
                to: { type: ['string', 'null'] },
              },
            },
            { type: 'null' },
          ],
        },
        contentType: {
          type: ['string', 'null'],
          enum: ['movie', 'tv', null],
        },
        genres: {
          type: 'array',
          items: { type: 'string' },
        },
        confidence: {
          type: 'string',
          enum: ['high', 'low'],
        },
      },
    },
  },
};
