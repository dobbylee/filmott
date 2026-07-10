import { MODULE_METADATA } from '@nestjs/common/constants';
import { ScheduleModule } from '@nestjs/schedule';
import { AppModule } from './app.module';
import { RankingsModule } from './rankings/rankings.module';

function getModuleImports(module: object): unknown[] {
  const imports: unknown = Reflect.getMetadata(MODULE_METADATA.IMPORTS, module);
  return Array.isArray(imports) ? imports : [];
}

function isScheduleModuleImport(moduleImport: unknown): boolean {
  if (moduleImport === ScheduleModule) return true;

  return (
    typeof moduleImport === 'object' &&
    moduleImport !== null &&
    'module' in moduleImport &&
    moduleImport.module === ScheduleModule
  );
}

describe('AppModule', () => {
  it('스케줄러를 앱 루트에서 한 번만 초기화해야 한다', () => {
    const appScheduleImports = getModuleImports(AppModule).filter(
      isScheduleModuleImport,
    );
    const rankingsScheduleImports = getModuleImports(RankingsModule).filter(
      isScheduleModuleImport,
    );

    expect(appScheduleImports).toHaveLength(1);
    expect(rankingsScheduleImports).toHaveLength(0);
  });
});
