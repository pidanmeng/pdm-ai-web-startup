/**
 * Copy example env files on first run without ever overwriting local values.
 * Run with: bun run setup:env
 */
const files = [
  ['apps/server/.env.example', 'apps/server/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
] as const

let copied = 0

for (const [source, target] of files) {
  const targetFile = Bun.file(target)
  if (await targetFile.exists()) {
    console.log(`• ${target} already exists, skipped`)
    continue
  }

  const sourceFile = Bun.file(source)
  if (!(await sourceFile.exists())) {
    console.warn(`! ${source} not found, skipped`)
    continue
  }

  await Bun.write(target, sourceFile)
  copied += 1
  console.log(`✓ ${target} created from ${source}`)
}

console.log(
  copied > 0
    ? '\nDone. Fill in LLM_API_KEY in apps/server/.env, then run `bun run db:migrate`.'
    : '\nNothing to do.',
)
