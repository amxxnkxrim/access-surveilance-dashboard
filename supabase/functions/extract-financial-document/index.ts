const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const expenseCategories = ['Fuel', '20mm pipe', '25mm pipe', 'Cameras', 'Sprag', 'Other equipment', 'Wages', 'Other']
const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const maxDocumentBase64Length = 5.5 * 1024 * 1024

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const parseGeminiJson = (text: string) => {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }

  const start = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (start >= 0 && last > start) cleaned = cleaned.slice(start, last + 1)

  const tryParse = (value: string) => JSON.parse(value)
  try {
    return tryParse(cleaned)
  } catch {
    let inString = false
    let escaped = false
    const normalized: string[] = []

    for (let index = 0; index < cleaned.length; index += 1) {
      const character = cleaned[index]
      if (inString) {
        if (escaped) {
          normalized.push(character)
          escaped = false
        } else if (character === '\\') {
          normalized.push(character)
          escaped = true
        } else if (character === '"') {
          normalized.push(character)
          inString = false
        } else if (character === '\n' || character === '\r' || character === '\t') {
          normalized.push(character === '\t' ? '\\t' : '\\n')
        } else {
          normalized.push(character)
        }
      } else if (character === '"') {
        normalized.push(character)
        inString = true
      } else {
        normalized.push(character)
      }
    }

    let repaired = normalized.join('').replace(/,\s*([}\]])/g, '$1')
    if (inString) repaired += '"'

    const stack: string[] = []
    inString = false
    escaped = false
    for (let index = 0; index < repaired.length; index += 1) {
      const character = repaired[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
      } else if (character === '"') {
        inString = true
      } else if (character === '{') {
        stack.push('}')
      } else if (character === '[') {
        stack.push(']')
      } else if ((character === '}' || character === ']') && stack.at(-1) === character) {
        stack.pop()
      }
    }
    repaired += stack.reverse().join('')

    return tryParse(repaired)
  }
}

const callGeminiWithRetry = async (
  geminiApiKey: string,
  model: string,
  body: Record<string, unknown>,
) => {
  let lastResponse: Response | null = null
  const retryDelays = [1500, 3000, 6000]
  const deadline = Date.now() + 55_000

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const remainingTime = deadline - Date.now()
    if (remainingTime <= 0) {
      throw new DOMException('The request timed out.', 'TimeoutError')
    }

    let response: Response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(Math.min(45_000, remainingTime)),
          body: JSON.stringify(body),
        },
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        if (attempt < retryDelays.length && Date.now() + retryDelays[attempt] < deadline) {
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]))
          continue
        }
      }
      throw error
    }

    lastResponse = response
    if (response.ok) return response

    if (
      ![429, 503, 502, 504].includes(response.status)
      || attempt === retryDelays.length
      || Date.now() + retryDelays[attempt] >= deadline
    ) {
      return response
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]))
  }

  return lastResponse
}

const getSupabasePublishableKey = () => {
  const legacyKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (legacyKey) return legacyKey

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (!publishableKeys) return undefined

  try {
    const parsedKeys = JSON.parse(publishableKeys)
    return typeof parsedKeys.default === 'string' ? parsedKeys.default : undefined
  } catch {
    return undefined
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })

  const authorization = request.headers.get('authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabasePublishableKey = getSupabasePublishableKey()
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('gemini key')
  if (!authorization || !supabaseUrl || !supabasePublishableKey) {
    return jsonResponse(401, { error: 'Sign in is required.' })
  }
  if (!geminiApiKey) return jsonResponse(503, { error: 'Gemini document extraction is not configured.' })

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabasePublishableKey, Authorization: authorization },
    })
    if (!userResponse.ok) return jsonResponse(401, { error: 'Sign in is required.' })
    const user = await userResponse.json()
    if (typeof user.email !== 'string') return jsonResponse(401, { error: 'An active staff profile is required.' })

    const profileUrl = new URL(`${supabaseUrl}/rest/v1/profiles`)
    profileUrl.searchParams.set('select', 'role,employment_status')
    profileUrl.searchParams.set('email', `eq.${user.email}`)
    const profileResponse = await fetch(profileUrl, {
      headers: { apikey: supabasePublishableKey, Authorization: authorization },
    })
    const profiles = profileResponse.ok ? await profileResponse.json() : []
    const profile = Array.isArray(profiles) ? profiles[0] : null
    if (
      profile?.employment_status?.toLowerCase() !== 'active'
      || !['ADMIN', 'OFFICE_ADMIN'].includes(profile.role)
    ) {
      return jsonResponse(403, { error: 'An active administrator or office administrator profile is required.' })
    }

    const body = await request.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return jsonResponse(400, { error: 'A valid request body is required.' })
    }

    if (body.action === 'business_advice') {
      const question = typeof body.question === 'string' ? body.question.trim() : ''
      const metrics = body.metrics
      if (!question || question.length > 1000) {
        return jsonResponse(400, { error: 'Enter a question of 1,000 characters or fewer.' })
      }
      if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics) || JSON.stringify(metrics).length > 12_000) {
        return jsonResponse(400, { error: 'The financial summary is missing or too large.' })
      }

      const history = Array.isArray(body.history)
        ? body.history.slice(-6).filter((message: { role?: unknown; content?: unknown }) =>
          ['user', 'assistant'].includes(String(message?.role)) && typeof message?.content === 'string',
        ).map((message: { role: 'user' | 'assistant'; content: string }) =>
          `${message.role}: ${message.content.slice(0, 1000)}`,
        )
        : []
      const prompt = [
        'You are a concise, practical small-business performance advisor.',
        'Use only the supplied financial summary. Do not invent missing costs, revenue, or causes.',
        'Profit figures have already been calculated by the app; do not alter them. Explain trends and suggest specific questions or actions to review.',
        'Invoiced revenue excludes VAT; cash received is recorded payments; recorded expenses may be incomplete.',
        'This is informational business feedback, not accounting, tax, legal, or investment advice.',
        `Financial summary: ${JSON.stringify(metrics)}`,
        history.length ? `Recent conversation:\n${history.join('\n')}` : '',
        `Current question: ${question}`,
      ].filter(Boolean).join('\n\n')

      let adviceResponse: Response
      try {
        adviceResponse = await callGeminiWithRetry(
          geminiApiKey,
          'gemini-3.5-flash-lite',
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
          },
        ) as Response
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          return jsonResponse(504, { error: 'The advisor took too long to respond. Try again with a shorter question.' })
        }
        throw error
      }
      if (!adviceResponse.ok) return jsonResponse(502, { error: 'Gemini could not provide business advice. Try again shortly.' })

      const adviceResult = await adviceResponse.json()
      const answer = adviceResult.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part.text === 'string')?.text
      if (typeof answer !== 'string' || !answer.trim()) {
        return jsonResponse(502, { error: 'The advisor returned no answer. Try asking again.' })
      }
      return jsonResponse(200, { answer: answer.trim() })
    }

    const documentType = body.documentType
    const mimeType = body.mimeType
    const imageBase64 = body.imageBase64
    if (!['customer_invoice', 'supplier_receipt'].includes(documentType)) {
      return jsonResponse(400, { error: 'Choose a customer invoice or supplier receipt.' })
    }
    if (typeof mimeType !== 'string' || !supportedMimeTypes.includes(mimeType)) {
      return jsonResponse(400, { error: 'Use a JPEG, PNG, WebP, or PDF document.' })
    }
    if (typeof imageBase64 !== 'string' || !imageBase64.length || imageBase64.length > maxDocumentBase64Length) {
      return jsonResponse(413, { error: 'The document is empty or too large to scan. Choose a smaller image or PDF.' })
    }

    const documentLabel = documentType === 'customer_invoice' ? 'customer sales invoice' : 'supplier expense receipt or invoice'
    const prompt = [
      `Read this ${documentLabel}. Amounts are in South African Rand (ZAR).`,
      'Return only the requested JSON fields. Dates must use YYYY-MM-DD or an empty string.',
      'Return subtotal, VAT, and total as numeric values without currency symbols; use 0 when a value is absent.',
      `For expenseCategory choose one of: ${expenseCategories.join(', ')}.`,
      'Classify wages/labour as Wages, fuel/petrol/diesel as Fuel, camera purchases as Cameras, and pipe sizes as 20mm pipe or 25mm pipe when identifiable.',
      'Extract every purchased or supplied line item separately.',
      'For each line item return itemName, quantity, unitPrice, lineTotal, expenseCategory, equipmentCategory, manufacturer, model, and serialNumber.',
      'Quantity and unitPrice must be actual printed values. If unitPrice is absent, calculate it only from a readable quantity and line total.',
      'Do not guess unreadable values; use 0 or an empty string.',
    ].join(' ')
    let geminiResponse: Response
    try {
      geminiResponse = await callGeminiWithRetry(
        geminiApiKey,
        'gemini-3.5-flash-lite',
        {
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                invoiceReference: { type: 'STRING' },
                documentDate: { type: 'STRING' },
                dueDate: { type: 'STRING' },
                counterparty: { type: 'STRING' },
                subtotal: { type: 'NUMBER' },
                vat: { type: 'NUMBER' },
                total: { type: 'NUMBER' },
                description: { type: 'STRING' },
                expenseCategory: { type: 'STRING', enum: expenseCategories },
                equipmentName: { type: 'STRING' },
                manufacturer: { type: 'STRING' },
                model: { type: 'STRING' },
                serialNumber: { type: 'STRING' },
                quantity: { type: 'NUMBER' },
                category: { type: 'STRING' },
                lineItems: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      itemName: { type: 'STRING' },
                      quantity: { type: 'NUMBER' },
                      unitPrice: { type: 'NUMBER' },
                      lineTotal: { type: 'NUMBER' },
                      expenseCategory: { type: 'STRING', enum: expenseCategories },
                      equipmentCategory: { type: 'STRING' },
                      manufacturer: { type: 'STRING' },
                      model: { type: 'STRING' },
                      serialNumber: { type: 'STRING' },
                    },
                    required: ['itemName', 'quantity', 'unitPrice', 'lineTotal', 'expenseCategory', 'equipmentCategory', 'manufacturer', 'model', 'serialNumber'],
                  },
                },
              },
              required: ['invoiceReference', 'documentDate', 'dueDate', 'counterparty', 'subtotal', 'vat', 'total', 'description', 'expenseCategory', 'equipmentName', 'manufacturer', 'model', 'serialNumber', 'quantity', 'category', 'lineItems'],
            },
          },
        },
      ) as Response
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return jsonResponse(504, { error: 'Document scanning took longer than 60 seconds. Try a clearer, smaller image and scan again.' })
      }
      throw error
    }
    if (!geminiResponse.ok) {
      let geminiError = ''
      try {
        const geminiBody = await geminiResponse.json()
        const message = geminiBody.error?.message
        if (typeof message === 'string') geminiError = message.slice(0, 300)
      } catch {
        geminiError = ''
      }
      return jsonResponse(502, {
        error: geminiError
          ? `Gemini rejected the request: ${geminiError}`
          : `Gemini could not read this document (HTTP ${geminiResponse.status}). Check the image and try again.`,
      })
    }

    const result = await geminiResponse.json()
    const text = result.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part.text === 'string')?.text
    if (typeof text !== 'string') {
      return jsonResponse(502, { error: 'Gemini returned no readable document details.' })
    }

    let extraction: Record<string, unknown>
    try {
      extraction = parseGeminiJson(text)
    } catch {
      return jsonResponse(502, { error: 'Gemini returned malformed document JSON. Try a clearer, smaller receipt image.' })
    }
    if (typeof extraction.total !== 'number' || !Number.isFinite(extraction.total) || extraction.total < 0) {
      return jsonResponse(502, { error: 'Gemini returned an invalid total. Review the document and try again.' })
    }

    return jsonResponse(200, {
      extraction: {
        invoiceReference: typeof extraction.invoiceReference === 'string' ? extraction.invoiceReference : '',
        documentDate: typeof extraction.documentDate === 'string' ? extraction.documentDate : '',
        dueDate: typeof extraction.dueDate === 'string' ? extraction.dueDate : '',
        counterparty: typeof extraction.counterparty === 'string' ? extraction.counterparty : '',
        subtotal: typeof extraction.subtotal === 'number' && Number.isFinite(extraction.subtotal) ? extraction.subtotal : 0,
        vat: typeof extraction.vat === 'number' && Number.isFinite(extraction.vat) ? extraction.vat : 0,
        total: extraction.total,
        description: typeof extraction.description === 'string' ? extraction.description : '',
        expenseCategory: expenseCategories.includes(extraction.expenseCategory) ? extraction.expenseCategory : 'Other',
        equipmentName: typeof extraction.equipmentName === 'string' ? extraction.equipmentName : '',
        manufacturer: typeof extraction.manufacturer === 'string' ? extraction.manufacturer : '',
        model: typeof extraction.model === 'string' ? extraction.model : '',
        serialNumber: typeof extraction.serialNumber === 'string' ? extraction.serialNumber : '',
        quantity: typeof extraction.quantity === 'number' && Number.isFinite(extraction.quantity) ? Math.max(1, Math.round(extraction.quantity)) : 1,
        category: typeof extraction.category === 'string' ? extraction.category : '',
        lineItems: Array.isArray(extraction.lineItems)
          ? extraction.lineItems
            .filter((item: Record<string, unknown>) => typeof item.itemName === 'string' && item.itemName.trim())
            .map((item: Record<string, unknown>) => {
              const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
                ? item.quantity
                : 1
              const lineTotal = typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal) ? item.lineTotal : 0
              const printedUnitPrice = typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? item.unitPrice : 0
              return {
                itemName: String(item.itemName).trim(),
                quantity,
                unitPrice: printedUnitPrice > 0 ? printedUnitPrice : (lineTotal > 0 ? lineTotal / quantity : 0),
                lineTotal,
                expenseCategory: expenseCategories.includes(String(item.expenseCategory)) ? String(item.expenseCategory) : 'Other',
                equipmentCategory: typeof item.equipmentCategory === 'string' ? item.equipmentCategory : '',
                manufacturer: typeof item.manufacturer === 'string' ? item.manufacturer : '',
                model: typeof item.model === 'string' ? item.model : '',
                serialNumber: typeof item.serialNumber === 'string' ? item.serialNumber : '',
              }
            })
          : [],
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 300) : ''
    return jsonResponse(500, {
      error: detail
        ? `Document extraction failed: ${detail}`
        : 'Document extraction failed. Check the document and try again.',
    })
  }
})
