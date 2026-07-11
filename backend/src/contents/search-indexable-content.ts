export const SEARCH_INDEXABLE_MIN_VOTE_COUNT = 100;

type SearchIndexableSignalSource =
  | {
      kind: 'joined';
      reviewAlias: string;
      rankingAlias: string;
    }
  | {
      kind: 'exists';
    };

interface SearchIndexableContentSqlOptions {
  contentAlias: string;
  minVoteCountPlaceholder: string;
  signalSource: SearchIndexableSignalSource;
}

export interface SearchIndexableContentSql {
  conditions: string[];
  predicate: string;
  minVoteCount: number;
}

export function buildSearchIndexableContentSql({
  contentAlias,
  minVoteCountPlaceholder,
  signalSource,
}: SearchIndexableContentSqlOptions): SearchIndexableContentSql {
  const reviewCondition =
    signalSource.kind === 'joined'
      ? `${signalSource.reviewAlias}.id IS NOT NULL`
      : `EXISTS (SELECT 1 FROM reviews search_review WHERE search_review.content_id = ${contentAlias}.id)`;
  const rankingCondition =
    signalSource.kind === 'joined'
      ? `${signalSource.rankingAlias}.id IS NOT NULL`
      : `EXISTS (SELECT 1 FROM rankings search_ranking WHERE search_ranking.content_id = ${contentAlias}.id)`;
  const conditions = [
    `${contentAlias}.adult IS NOT TRUE`,
    `NULLIF(BTRIM(${contentAlias}.title), '') IS NOT NULL`,
    `NULLIF(BTRIM(${contentAlias}.overview), '') IS NOT NULL`,
    `NULLIF(BTRIM(${contentAlias}.poster_url), '') IS NOT NULL`,
    `${contentAlias}.release_date IS NOT NULL`,
    `(${[
      reviewCondition,
      rankingCondition,
      `${contentAlias}.watch_providers IS NOT NULL`,
      `${contentAlias}.vote_count >= ${minVoteCountPlaceholder}`,
    ].join(' OR ')})`,
  ];

  return {
    conditions,
    predicate: conditions.map((condition) => `(${condition})`).join('\nAND '),
    minVoteCount: SEARCH_INDEXABLE_MIN_VOTE_COUNT,
  };
}
