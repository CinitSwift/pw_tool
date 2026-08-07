import type { AppSettings } from '../../shared/domain/types';

export interface SettingsRepository {
  getSettings(): AppSettings;
  saveSettings(settings: AppSettings): void;
  transaction<T>(work: () => T): T;
}

export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}

  get(): AppSettings {
    return this.repository.getSettings();
  }

  save(settings: AppSettings): AppSettings {
    this.repository.transaction(() => this.repository.saveSettings(settings));
    return this.repository.getSettings();
  }
}
