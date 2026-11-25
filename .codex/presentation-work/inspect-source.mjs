import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const artifactToolPath = 'C:\\Program Files\\WindowsApps\\OpenAI.CodexPrimaryRuntime.v26-1112-737-0_26.1112.737.0_x64__3k8sg7r9htsxt\\dependencies\\node\\node_modules\\@oai\\artifact-tool\\dist\\artifact_tool.mjs';
const { FileBlob, PresentationFile } = await import(pathToFileURL(artifactToolPath).href);
const inputPath = process.argv[2];
const outputDir = path.resolve(process.argv[3]);
if (!inputPath || !outputDir) throw new Error('Pass the PPTX path and a workspace output directory.');
await fs.mkdir(outputDir, { recursive: true });

const presentation = await PresentationFile.importPptx(await FileBlob.load(inputPath));
const inspected = await presentation.inspect({
  select: '$.slides[*]',
  include: ['id', 'index', 'layout', 'title', 'elements.id', 'elements.kind', 'elements.text', 'elements.alt', 'elements.title', 'elements.position', 'elements.style', 'notes.text'],
});
await fs.writeFile(path.join(outputDir, 'source-slides.ndjson'), inspected.ndjson, 'utf8');

for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `source-slide-${String(index + 1).padStart(2, '0')}`;
  const image = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(outputDir, `${stem}.png`), new Uint8Array(await image.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(outputDir, `${stem}.layout.json`), await layout.text(), 'utf8');
}

const montage = await presentation.export({ format: 'webp', montage: true, scale: 1 });
await fs.writeFile(path.join(outputDir, 'source-montage.webp'), new Uint8Array(await montage.arrayBuffer()));
console.log(`Imported ${presentation.slides.items.length} slides.`);
console.log(inspected.ndjson);
