import { load } from "@tauri-apps/plugin-store";

let _store: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!_store) {
    _store = await load("settings.json", { defaults: {}, autoSave: 100 });
  }
  return _store;
}

export async function getFolder(): Promise<string | null> {
  const s = await getStore();
  return (await s.get<string>("folder")) ?? null;
}

export async function setFolder(folder: string): Promise<void> {
  const s = await getStore();
  await s.set("folder", folder);
}

export async function getLastOpened(): Promise<string | null> {
  const s = await getStore();
  return (await s.get<string>("lastOpened")) ?? null;
}

export async function setLastOpened(path: string): Promise<void> {
  const s = await getStore();
  await s.set("lastOpened", path);
}

export async function getTheme(): Promise<"amber" | "green" | "mac"> {
  const s = await getStore();
  const val = await s.get<string>("phosphor");
  if (val === "green" || val === "mac") return val;
  return "amber";
}

export async function setTheme(theme: "amber" | "green" | "mac"): Promise<void> {
  const s = await getStore();
  await s.set("phosphor", theme);
}

export async function getWysiwyg(): Promise<boolean> {
  const s = await getStore();
  return (await s.get<boolean>("wysiwyg")) ?? true;
}

export async function setWysiwyg(val: boolean): Promise<void> {
  const s = await getStore();
  await s.set("wysiwyg", val);
}

export async function getKeySounds(): Promise<boolean> {
  const s = await getStore();
  return (await s.get<boolean>("keySounds")) ?? false;
}

export async function setKeySounds(val: boolean): Promise<void> {
  const s = await getStore();
  await s.set("keySounds", val);
}
