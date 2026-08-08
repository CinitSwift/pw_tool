import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json';

type PackageBuildConfig = {
  appId: string;
  productName: string;
  asar: boolean;
  files: string[];
  mac: { target: Array<{ target: string; arch: string[] }> };
  win: { target: Array<{ target: string; arch: string[] }> };
};

describe('package build config', () => {
  it('declares the desktop packaging metadata required for unsigned builds', () => {
    const build = packageJson.build as unknown as Partial<PackageBuildConfig> | undefined;

    expect(packageJson.productName).toBe('陪玩小工具');
    expect(build?.appId).toBe('com.pwtool.desktop');
    expect(build?.productName).toBe('陪玩小工具');
    expect(build?.asar).toBe(true);
    expect(build?.files).toEqual(['out/**/*', 'package.json']);
    expect(build?.mac?.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }]);
    expect(build?.win?.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
  });

  it('uses electron-builder for the mac and windows package scripts', () => {
    expect(packageJson.scripts?.['package:mac']).toContain('electron-builder --mac dmg');
    expect(packageJson.scripts?.['package:win']).toContain('electron-builder --win nsis');
  });
});
