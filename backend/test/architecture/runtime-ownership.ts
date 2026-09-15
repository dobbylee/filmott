export interface ProviderRegistration {
  token: unknown;
  instance: unknown;
  metatype?: unknown;
  isAlias?: boolean;
}
export interface EntityRegistration {
  tablePath: string;
  target: unknown;
}

export function assertProviderOwnership(
  registrations: ProviderRegistration[],
  expected: { token: unknown; instance: unknown }[],
): void {
  if (!expected.length) throw new Error('검사할 provider가 없습니다.');
  for (const entry of expected) {
    const matches = registrations.filter(
      (p) => p.token === entry.token && !p.isAlias,
    );
    const name =
      typeof entry.token === 'function'
        ? entry.token.name
        : String(entry.token);
    const ownerInstances = new Set(
      registrations
        .filter(
          (p) =>
            p.token === entry.token ||
            p.metatype === entry.token ||
            (typeof entry.token === 'function' &&
              p.instance instanceof entry.token),
        )
        .map((p) => p.instance),
    );
    if (
      matches.length !== 1 ||
      !entry.instance ||
      matches[0].instance !== entry.instance ||
      ownerInstances.size !== 1
    )
      throw new Error(`provider 단일 소유 위반: ${name} (${matches.length})`);
  }
}

export function assertEntityOwnership(
  registrations: EntityRegistration[],
  expectedTargets: unknown[],
): void {
  if (!expectedTargets.length) throw new Error('검사할 entity가 없습니다.');
  const tables = new Set<string>();
  for (const entity of registrations) {
    if (tables.has(entity.tablePath))
      throw new Error(`entity table 중복: ${entity.tablePath}`);
    tables.add(entity.tablePath);
    if (!expectedTargets.includes(entity.target))
      throw new Error(`예상하지 않은 entity: ${entity.tablePath}`);
  }
  for (const target of expectedTargets) {
    if (registrations.filter((entity) => entity.target === target).length !== 1)
      throw new Error('entity class 단일 소유 위반');
  }
}
