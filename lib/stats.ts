import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type Stats = {
  judges: number;
  persistence: "volume" | "temporary";
};

const VOLUME_DIRECTORY = "/data";
const TEMP_DIRECTORY = "/tmp";
const FILE_NAME = "firstscreen-stats.json";

let operation = Promise.resolve();

async function storageTarget() {
  try {
    await access(VOLUME_DIRECTORY, constants.W_OK);
    return {
      file: path.join(VOLUME_DIRECTORY, "stats.json"),
      persistence: "volume" as const,
    };
  } catch {
    await mkdir(TEMP_DIRECTORY, { recursive: true });
    return {
      file: path.join(TEMP_DIRECTORY, FILE_NAME),
      persistence: "temporary" as const,
    };
  }
}

async function readCount(file: string) {
  try {
    const stored = JSON.parse(await readFile(file, "utf8")) as { judges?: unknown };
    return typeof stored.judges === "number" && Number.isSafeInteger(stored.judges) && stored.judges >= 0
      ? stored.judges
      : 0;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : null;
    if (code === "ENOENT" || error instanceof SyntaxError) return 0;
    throw error;
  }
}

export async function getStats(): Promise<Stats> {
  const target = await storageTarget();
  return {
    judges: await readCount(target.file),
    persistence: target.persistence,
  };
}

export function incrementJudges(): Promise<Stats> {
  const next = operation.then(async () => {
    const target = await storageTarget();
    const judges = (await readCount(target.file)) + 1;
    const temporaryFile = `${target.file}.${process.pid}.${Date.now()}.tmp`;

    await writeFile(temporaryFile, `${JSON.stringify({ judges })}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryFile, target.file);

    return { judges, persistence: target.persistence };
  });

  operation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
