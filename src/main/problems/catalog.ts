import {
  problemSchema,
  problemSummarySchema,
  type Problem,
  type ProblemSummary
} from '../../shared/contracts'

const catalog: Problem[] = [
  {
    id: 'pair-sum',
    title: 'Pair Sum',
    difficulty: 'easy',
    topics: ['arrays', 'hash maps'],
    description:
      'Return the indices of two distinct values whose sum equals the target. Return an empty array when no pair exists.',
    constraints: [
      '2 <= values.length <= 10,000',
      'Each input has at most one matching pair',
      'Return indices in ascending order'
    ],
    examples: [
      {
        input: 'values = [2, 7, 11, 15], target = 9',
        output: '[0, 1]',
        explanation: 'values[0] + values[1] equals 9.'
      }
    ],
    functionName: 'pairSum',
    starterCode: `function pairSum(values, target) {
  // Return the two matching indices, or [].
}
`,
    visibleTests: [
      { name: 'finds a pair at the beginning', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { name: 'finds a pair after the beginning', args: [[4, 1, 8, 3], 9], expected: [1, 2] },
      { name: 'returns empty when no pair exists', args: [[1, 2, 3], 10], expected: [] }
    ],
    hiddenTests: [
      { name: 'supports negative values', args: [[-8, 3, 5, 11], -3], expected: [0, 2] },
      { name: 'uses distinct duplicate values', args: [[6, 6], 12], expected: [0, 1] }
    ],
    referenceComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'compress-runs',
    title: 'Compress Runs',
    difficulty: 'easy',
    topics: ['strings'],
    description:
      'Compress consecutive runs in a string by appending each character followed by its run length.',
    constraints: [
      '0 <= text.length <= 10,000',
      'text contains printable ASCII characters',
      'An empty string compresses to an empty string'
    ],
    examples: [
      {
        input: 'text = "aaabbc"',
        output: '"a3b2c1"',
        explanation: 'There are three a characters, two b characters, and one c character.'
      }
    ],
    functionName: 'compressRuns',
    starterCode: `function compressRuns(text) {
  // Return the run-length encoded string.
}
`,
    visibleTests: [
      { name: 'compresses several runs', args: ['aaabbc'], expected: 'a3b2c1' },
      { name: 'compresses a single character', args: ['z'], expected: 'z1' },
      { name: 'handles empty input', args: [''], expected: '' }
    ],
    hiddenTests: [
      { name: 'keeps separated runs distinct', args: ['abbaa'], expected: 'a1b2a2' },
      { name: 'supports counts above nine', args: ['xxxxxxxxxxxx'], expected: 'x12' }
    ],
    referenceComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'most-common-tag',
    title: 'Most Common Tag',
    difficulty: 'easy',
    topics: ['hash maps'],
    description:
      'Return the most frequent tag. When frequencies tie, return the tag that appeared first in the input.',
    constraints: [
      '1 <= tags.length <= 20,000',
      'Each tag is a non-empty string',
      'Tag comparison is case-sensitive'
    ],
    examples: [
      {
        input: 'tags = ["api", "ui", "api", "docs", "ui", "api"]',
        output: '"api"'
      }
    ],
    functionName: 'mostCommonTag',
    starterCode: `function mostCommonTag(tags) {
  // Return the most frequent tag.
}
`,
    visibleTests: [
      {
        name: 'returns the most frequent tag',
        args: [['api', 'ui', 'api', 'docs', 'api']],
        expected: 'api'
      },
      { name: 'returns the only tag', args: [['release']], expected: 'release' },
      {
        name: 'breaks a tie by first appearance',
        args: [['beta', 'alpha', 'alpha', 'beta']],
        expected: 'beta'
      }
    ],
    hiddenTests: [
      {
        name: 'distinguishes letter case',
        args: [['JS', 'js', 'js', 'JS']],
        expected: 'JS'
      },
      {
        name: 'handles a late frequency leader',
        args: [['a', 'b', 'c', 'c', 'c']],
        expected: 'c'
      }
    ],
    referenceComplexity: { time: 'O(n)', space: 'O(k)' }
  },
  {
    id: 'balanced-markers',
    title: 'Balanced Markers',
    difficulty: 'medium',
    topics: ['stacks', 'strings'],
    description:
      'Return true when every opening bracket in the string is closed by the matching bracket in the correct order.',
    constraints: [
      '0 <= text.length <= 20,000',
      'text contains only (), [], and {} characters',
      'The empty string is balanced'
    ],
    examples: [
      {
        input: 'text = "{[()]}"',
        output: 'true',
        explanation: 'Each closing marker matches the most recent opening marker.'
      }
    ],
    functionName: 'balancedMarkers',
    starterCode: `function balancedMarkers(text) {
  // Return whether the marker sequence is balanced.
}
`,
    visibleTests: [
      { name: 'accepts nested markers', args: ['{[()]}'], expected: true },
      { name: 'rejects crossed markers', args: ['([)]'], expected: false },
      { name: 'accepts empty input', args: [''], expected: true }
    ],
    hiddenTests: [
      { name: 'rejects an unmatched opener', args: ['(()'], expected: false },
      { name: 'rejects a leading closer', args: [')'], expected: false }
    ],
    referenceComplexity: { time: 'O(n)', space: 'O(n)' }
  },
  {
    id: 'closest-pair',
    title: 'Closest Pair',
    difficulty: 'medium',
    topics: ['two pointers', 'arrays'],
    description:
      'Given a sorted array, return the two values whose sum is closest to the target. On a tie, return the pair with the smaller first value.',
    constraints: [
      '2 <= values.length <= 20,000',
      'values is sorted in ascending order',
      'Return the values, not their indices'
    ],
    examples: [
      {
        input: 'values = [1, 4, 7, 10], target = 12',
        output: '[1, 10]',
        explanation: 'The sum 11 is one away from the target.'
      }
    ],
    functionName: 'closestPair',
    starterCode: `function closestPair(values, target) {
  // Return the two values with the closest sum.
}
`,
    visibleTests: [
      { name: 'finds the closest pair', args: [[1, 4, 7, 10], 12], expected: [1, 10] },
      { name: 'finds an exact sum', args: [[-3, 2, 5, 9], 7], expected: [2, 5] },
      {
        name: 'uses the smaller first value on a tie',
        args: [[1, 3, 5, 7], 9],
        expected: [1, 7]
      }
    ],
    hiddenTests: [
      { name: 'handles two values', args: [[4, 8], 100], expected: [4, 8] },
      { name: 'handles negative values', args: [[-10, -4, 1, 6], -6], expected: [-10, 6] }
    ],
    referenceComplexity: { time: 'O(n)', space: 'O(1)' }
  }
].map((problem) => problemSchema.parse(problem))

export function listProblems(): ProblemSummary[] {
  return catalog.map(({ hiddenTests: _hidden, ...problem }) =>
    problemSummarySchema.parse(problem)
  )
}

export function getProblem(id: string): Problem | undefined {
  return catalog.find((problem) => problem.id === id)
}
