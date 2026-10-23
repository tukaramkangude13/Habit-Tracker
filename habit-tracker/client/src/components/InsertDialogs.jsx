import { useState } from 'react';
import { chartSvg, svgToDataUrl } from '../richText';
import { Field, Modal, inp } from './ui';

export function ChartDialog({ onClose, onInsert }) {
  const [type, setType] = useState('bar');
  const [title, setTitle] = useState('My chart');
  const [data, setData] = useState(
    'Jan, 10\nFeb, 25\nMar, 18'
  );

  const submit = () => {
    const rows = data
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.lastIndexOf(',');

        return index < 0
          ? ['', NaN]
          : [
              line.slice(0, index).trim(),
              Number(line.slice(index + 1)),
            ];
      });

    if (rows.length < 1 || rows.length > 24) {
      throw new Error(
        'Enter 1 to 24 lines like: Label, 12'
      );
    }

    if (
      rows.some(
        ([label, value]) =>
          !label || !Number.isFinite(value) || value < 0
      )
    ) {
      throw new Error(
        'Each line must look like: Label, 12'
      );
    }

    onInsert(
      svgToDataUrl(
        chartSvg({
          type,
          title: title.trim(),
          rows,
        })
      )
    );
  };

  return (
    <Modal
      title="Insert chart"
      onClose={onClose}
      onSubmit={submit}
    >
      <Field label="Type">
        <select
          className={inp}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="bar">Bar chart</option>
          <option value="line">Line chart</option>
        </select>
      </Field>

      <Field label="Title">
        <input
          className={inp}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={60}
        />
      </Field>

      <Field label="Data (one line each: Label, Number)">
        <textarea
          rows={6}
          className={`${inp} font-mono`}
          value={data}
          onChange={(event) => setData(event.target.value)}
        />
      </Field>
    </Modal>
  );
}

const SAMPLE = `flowchart TD
  A[Idea] --> B[Script]
  B --> C[Record]
  C --> D[Edit]
  D --> E[Publish]`;

export function DiagramDialog({ onClose, onInsert }) {
  const [code, setCode] = useState(SAMPLE);

  const submit = async () => {
    if (!code.trim()) {
      throw new Error('Write the diagram text first.');
    }

    const id = 'd' + Date.now();

    try {
      const { default: mermaid } = await import('mermaid');

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        flowchart: { htmlLabels: false },
        htmlLabels: false,
      });

      const { svg } = await mermaid.render(
        id,
        code.trim()
      );

      const viewBox = svg.match(
        /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/
      );

      let output = viewBox
        ? svg.replace(
            /width="100%"/,
            `width="${Math.round(Number(viewBox[1]))}" height="${Math.round(Number(viewBox[2]))}"`
          )
        : svg;

      output = output.replace(
        /style="max-width:[^"]*"/,
        'style="background:#fff"'
      );

      onInsert(svgToDataUrl(output));
    } catch (error) {
      document.getElementById(id)?.remove();

      throw new Error(
        'Diagram text has an error: ' +
        String(error.message || error).split('\n')[0]
      );
    }
  };

  return (
    <Modal
      title="Insert diagram"
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="text-xs text-zinc-500">
        Write the diagram as text. Examples:{' '}
        <code>flowchart LR</code>, <code>mindmap</code>,{' '}
        <code>sequenceDiagram</code>,{' '}
        <code>pie title Time</code>.
      </p>

      <textarea
        rows={9}
        className={`${inp} font-mono`}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        aria-label="Diagram text"
      />
    </Modal>
  );
}
