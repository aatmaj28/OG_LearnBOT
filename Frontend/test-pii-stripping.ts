/**
 * PII Stripping Test Script
 * 
 * This script demonstrates how the guardrails layer uses a LOCAL remote LLM (Blackwell)
 * to intelligently strip Personal Identifiable Information (PII) from user queries
 * before sending them to the main LLM.
 * 
 * IMPORTANT: We use a LOCAL remote LLM (not external APIs like Claude) to ensure
 * PII never leaves our infrastructure. This protects student privacy.
 * 
 * Usage:
 *   Option 1: npx tsx test-pii-stripping.ts
 *   Option 2: npm install -g tsx && tsx test-pii-stripping.ts
 *   Option 3: Compile with tsc and run with node (requires tsconfig.json)
 * 
 * Prerequisites:
 *   - SSH tunnel to Blackwell server must be active (if using localhost endpoint)
 *   - Or direct access to Blackwell endpoint
 *   - Internet connection to access local remote LLM
 */

import * as fs from 'fs'
import * as path from 'path'

// Load environment variables from .env file if available
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config()
} catch {
  // dotenv not available or already loaded - continue
}

// Blackwell vLLM Configuration (LOCAL remote LLM - our infrastructure)
// Options:
//   1. Via SSH tunnel: http://localhost:8001/v1/chat/completions (requires: ssh -L 8001:localhost:8000 ra_aatmaj@129.10.224.226)
//   2. Direct endpoint: http://129.10.224.226:8000/v1/chat/completions (if accessible)
// Set BLACKWELL_ENDPOINT in .env to override
const BLACKWELL_ENDPOINT = process.env.BLACKWELL_ENDPOINT || 'http://localhost:8001/v1/chat/completions'
const BLACKWELL_MODEL = 'google/gemma-3-12b-it'

/**
 * System prompt for Blackwell vLLM to strip PII
 */
const PII_STRIPPING_SYSTEM_PROMPT = `You are a PII (Personally Identifiable Information) stripping system for an educational chatbot.

Your task is to remove or replace all PII from user queries while preserving the core question or request.

PII includes:
- Names (first, last, full names)
- Ages
- Dates of birth
- Email addresses
- Phone numbers
- Physical addresses
- Student IDs (NUID, SSN, etc.)
- Credit card numbers
- Any other personally identifiable information

Rules:
1. Remove or replace PII with generic placeholders like [NAME], [AGE], [EMAIL], etc.
2. Preserve the core question/request - don't change the meaning
3. Keep all non-PII information intact
4. Maintain natural language flow
5. If the query is just personal information with no question, return a cleaned version that asks for help

Return ONLY the cleaned query text, nothing else. No explanations, no JSON, just the cleaned text.`

/**
 * Call Blackwell vLLM (LOCAL remote LLM) to strip PII from a query
 * This ensures PII never leaves our infrastructure
 */
async function stripPIIWithBlackwell(query: string): Promise<string> {
  try {
    // For vLLM, we combine system prompt and user query into a single user message
    // (This is a workaround for vLLM's system message handling)
    const combinedContent = `${PII_STRIPPING_SYSTEM_PROMPT}\n\nUser query to clean: ${query}`

    const response = await fetch(BLACKWELL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: BLACKWELL_MODEL,
        messages: [
          { role: 'user', content: combinedContent }
        ],
        temperature: 0.1, // Low temperature for consistent PII stripping
        max_tokens: 512,
        stream: false
      }),
      signal: AbortSignal.timeout(120000) // 2 minute timeout
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Blackwell vLLM API error: ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    const cleanedQuery = data.choices?.[0]?.message?.content || ''
    
    if (!cleanedQuery) {
      throw new Error('Empty response from Blackwell vLLM')
    }
    
    return cleanedQuery.trim()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Blackwell vLLM took too long to respond')
    }
    throw new Error(`Failed to strip PII with Blackwell: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Test cases with different types of PII
 */
const TEST_QUERIES = [
  {
    id: 1,
    description: 'Query with name and age',
    original: 'Hi my name is Alex and I am 24 years old, I wanted information on corporate taxes.'
  },
  {
    id: 2,
    description: 'Query with email and student ID',
    original: 'My email is john.smith@northeastern.edu and my NUID is 123456789. Can you help me understand present value calculations?'
  },
  {
    id: 3,
    description: 'Query with date of birth and phone number',
    original: 'I was born on 05/15/2000 and my phone is 617-555-1234. I need help with annuity problems.'
  },
  {
    id: 4,
    description: 'Query with full address',
    original: 'I live at 123 Main Street, Boston, MA 02115. Can you explain how to calculate future value?'
  },
  {
    id: 5,
    description: 'Query with multiple PII types',
    original: 'Hi, I\'m Sarah Johnson, 22 years old. My email is sarah.j@northeastern.edu, NUID 987654321, and I was born on 03/20/2002. I need help understanding loan amortization schedules.'
  }
]

/**
 * Helper function to log and add to results string
 */
function logAndAdd(message: string, results: string[]): void {
  console.log(message)
  results.push(message)
}

/**
 * Save results to a text file
 */
function saveResultsToFile(results: string[], outputDir: string = '.'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `pii-stripping-test-results-${timestamp}.txt`
  const filepath = path.join(outputDir, filename)
  
  const content = results.join('\n')
  fs.writeFileSync(filepath, content, 'utf-8')
  
  return filepath
}

/**
 * Main test function
 */
async function runTests() {
  const results: string[] = []
  const startTime = new Date()

  logAndAdd('='.repeat(80), results)
  logAndAdd('PII STRIPPING TEST - Blackwell vLLM (LOCAL Remote LLM)', results)
  logAndAdd('='.repeat(80), results)
  logAndAdd('', results)
  logAndAdd(`Test Run Date: ${startTime.toLocaleString()}`, results)
  logAndAdd('', results)
  logAndAdd('This script demonstrates how the guardrails layer strips PII from user queries.', results)
  logAndAdd('Each test shows the original query with PII and the cleaned query sent to the LLM.', results)
  logAndAdd('', results)
  logAndAdd('🔒 PRIVACY NOTE: Using LOCAL remote LLM ensures PII never leaves our infrastructure!', results)
  logAndAdd('', results)
  logAndAdd('='.repeat(80), results)
  logAndAdd('', results)

  logAndAdd('✅ Using LOCAL remote LLM: Blackwell vLLM', results)
  logAndAdd(`✅ Endpoint: ${BLACKWELL_ENDPOINT}`, results)
  logAndAdd(`✅ Model: ${BLACKWELL_MODEL}`, results)
  logAndAdd('', results)
  logAndAdd('⚠️  Make sure SSH tunnel is active if using localhost endpoint:', results)
  logAndAdd('   ssh -L 8001:localhost:8000 ra_aatmaj@129.10.224.226', results)
  logAndAdd('', results)
  logAndAdd('='.repeat(80), results)
  logAndAdd('', results)

  const testResults: Array<{
    id: number
    description: string
    original: string
    cleaned: string | null
    timeTaken: number | null
    error: string | null
  }> = []

  for (const testCase of TEST_QUERIES) {
    logAndAdd(`\n📋 TEST ${testCase.id}: ${testCase.description}`, results)
    logAndAdd('-'.repeat(80), results)
    logAndAdd('\n🔴 ORIGINAL QUERY (with PII):', results)
    logAndAdd(`   "${testCase.original}"`, results)
    logAndAdd('', results)

    try {
      const startTime = Date.now()
      const cleanedQuery = await stripPIIWithBlackwell(testCase.original)
      const timeTaken = Date.now() - startTime

      logAndAdd('🟢 CLEANED QUERY (PII removed):', results)
      logAndAdd(`   "${cleanedQuery}"`, results)
      logAndAdd('', results)
      logAndAdd(`⏱️  Processing time: ${timeTaken}ms`, results)
      logAndAdd('', results)

      testResults.push({
        id: testCase.id,
        description: testCase.description,
        original: testCase.original,
        cleaned: cleanedQuery,
        timeTaken,
        error: null
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logAndAdd(`❌ ERROR: ${errorMessage}`, results)
      logAndAdd('', results)

      testResults.push({
        id: testCase.id,
        description: testCase.description,
        original: testCase.original,
        cleaned: null,
        timeTaken: null,
        error: errorMessage
      })
    }

    logAndAdd('='.repeat(80), results)
  }

  const endTime = new Date()
  const totalTime = endTime.getTime() - startTime.getTime()

  logAndAdd('', results)
  logAndAdd('✅ All tests completed!', results)
  logAndAdd(`⏱️  Total test duration: ${(totalTime / 1000).toFixed(2)}s`, results)
  logAndAdd('', results)
  logAndAdd('Summary:', results)
  logAndAdd('- The guardrails layer uses LOCAL remote LLM (Blackwell) to intelligently detect and remove PII', results)
  logAndAdd('- PII is processed on our own infrastructure - never sent to external APIs', results)
  logAndAdd('- The cleaned queries are then sent to the main LLM for processing', results)
  logAndAdd('- This protects student privacy and prevents PII from being stored in logs', results)
  logAndAdd('- Using a local LLM ensures complete data privacy and control', results)
  logAndAdd('', results)
  logAndAdd('='.repeat(80), results)
  logAndAdd('', results)
  logAndAdd('Test Results Summary:', results)
  logAndAdd(`- Total tests: ${TEST_QUERIES.length}`, results)
  logAndAdd(`- Successful: ${testResults.filter(r => r.error === null).length}`, results)
  logAndAdd(`- Failed: ${testResults.filter(r => r.error !== null).length}`, results)
  if (testResults.some(r => r.timeTaken !== null)) {
    const avgTime = testResults
      .filter(r => r.timeTaken !== null)
      .reduce((sum, r) => sum + (r.timeTaken || 0), 0) / testResults.filter(r => r.timeTaken !== null).length
    logAndAdd(`- Average processing time: ${avgTime.toFixed(0)}ms`, results)
  }
  logAndAdd('', results)

  // Save to file
  try {
    const filepath = saveResultsToFile(results)
    logAndAdd(`📄 Results saved to: ${filepath}`, results)
    console.log(`\n📄 Results saved to: ${filepath}`)
  } catch (error) {
    logAndAdd(`❌ Failed to save results to file: ${error instanceof Error ? error.message : String(error)}`, results)
    console.error(`\n❌ Failed to save results to file:`, error)
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

