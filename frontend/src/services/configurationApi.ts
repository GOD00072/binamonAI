import { configurationApi } from './api';

export const getConfiguration = async (section: string) => {
  try {
    const res = await configurationApi.getConfigSection(section as any);
    return { success: true, config: res };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
};

export const updateConfiguration = async (section: string, config: any) => {
  try {
    const res = await configurationApi.updateConfigSection(section as any, config);
    return { success: true, config: res };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
};

export const resetConfiguration = async (section?: string) => {
  try {
    const res = await configurationApi.resetConfig(section as any);
    return { success: true, config: res };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
};
