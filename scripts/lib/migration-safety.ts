/** Única excepción automática: ampliar un VARCHAR de tamaño conocido, sin USING. */
export function registerVarcharColumns(sql: string, limits: Map<string, number>): void {
  for (const table of sql.matchAll(/CREATE\s+TABLE\s+"([A-Za-z0-9_]+)"\s*\(([\s\S]*?)\);/giu)) {
    for (const column of table[2]!.matchAll(
      /(?:^|\n)\s*"([A-Za-z0-9_]+)"\s+(?:VARCHAR|CHARACTER\s+VARYING)\s*\((\d+)\)/giu,
    )) {
      limits.set(`${table[1]}.${column[1]}`, Number(column[2]));
    }
  }
}
export function acceptVarcharExpansion(line: string, limits: Map<string, number>): boolean {
  const match =
    /^\s*ALTER\s+TABLE\s+"([A-Za-z0-9_]+)"\s+ALTER\s+COLUMN\s+"([A-Za-z0-9_]+)"\s+SET\s+DATA\s+TYPE\s+VARCHAR\s*\((\d+)\)\s*;\s*$/iu.exec(
      line,
    );
  if (!match) return false;
  const key = `${match[1]}.${match[2]}`,
    before = limits.get(key),
    after = Number(match[3]);
  if (before === undefined || !Number.isSafeInteger(after) || after <= before || after > 10485760)
    return false;
  limits.set(key, after);
  return true;
}
