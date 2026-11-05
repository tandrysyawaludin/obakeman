import type { TestRunResult } from '../../../../shared/contracts'

function displayValue(value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? String(value) : serialized
}

export function TestResults({ result }: { result: TestRunResult }): React.JSX.Element {
  const passed = result.visible.filter((test) => test.passed).length

  return (
    <section className="results-panel" aria-live="polite">
      <div className="results-heading">
        <h2>Test results</h2>
        {result.status === 'timeout' && <strong>Execution timed out</strong>}
        {result.status === 'runtime_error' && <strong>Runtime error</strong>}
        {(result.status === 'passed' || result.status === 'failed') && (
          <strong>{passed} of {result.visible.length} visible tests passed</strong>
        )}
      </div>

      {result.error && <p className="execution-error">{result.error}</p>}

      {result.visible.length > 0 && (
        <ul className="test-list">
          {result.visible.map((test) => (
            <li key={test.name} className={test.passed ? 'test-passed' : 'test-failed'}>
              <strong>{test.passed ? 'Pass' : 'Fail'} · {test.name}</strong>
              {!test.passed && test.error && <p>{test.error}</p>}
              {!test.passed && !test.error && (
                <p>
                  Expected {displayValue(test.expected)}, received {displayValue(test.actual)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {result.console.length > 0 && (
        <pre className="console-output">{result.console.join('\n')}</pre>
      )}
      {result.outputTruncated && <p className="output-note">Output was truncated.</p>}
    </section>
  )
}
