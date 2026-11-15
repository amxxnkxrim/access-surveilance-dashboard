const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const expenseCategories = ['Fuel', '20mm pipe', '25mm pipe', 'Cameras', 'Sprag', 'Other equipment', 'Wages', 'Other']
const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

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
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
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
        adviceResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(25_000),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
            }),
          },
        )
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
    if (typeof imageBase64 !== 'string' || !imageBase64.length || imageBase64.length > 14 * 1024 * 1024) {
      return jsonResponse(413, { error: 'The document is empty or exceeds the 10 MB limit.' })
    }

    const documentLabel = documentType === 'customer_invoice' ? 'customer sales invoice' : 'supplier expense receipt or invoice'
    const prompt = [
      `Read this ${documentLabel}. Amounts are in South African Rand (ZAR).`,
      'Return only the requested JSON fields. Dates must use YYYY-MM-DD or an empty string.',
      'Return subtotal, VAT, and total as numeric values without currency symbols; use 0 when a value is absent.',
      `For expenseCategory choose one of: ${expenseCategories.join(', ')}.`,
      'Classify wages/labour as Wages, fuel/petrol/diesel as Fuel, camera purchases as Cameras, and pipe sizes as 20mm pipe or 25mm pipe when identifiable.',
      'Do not guess unreadable values; use 0 or an empty string.',
    ].join(' ')
    let geminiResponse: Response
    try {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 256,
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
              },
              required: ['invoiceReference', 'documentDate', 'dueDate', 'counterparty', 'subtotal', 'vat', 'total', 'description', 'expenseCategory'],
            },
          },
        }),
        },
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        return jsonResponse(504, { error: 'Document scanning took too long. Try a clearer, smaller image or try again.' })
      }
      throw error
    }
    if (!geminiResponse.ok) {
      return jsonResponse(502, { error: 'Gemini could not read this document. Check the image and try again.' })
    }

    const result = await geminiResponse.json()
    const text = result.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part.text === 'string')?.text
    if (typeof text !== 'string') {
      return jsonResponse(502, { error: 'Gemini returned no readable document details.' })
    }

    const extraction = JSON.parse(text)
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
      },
    })
  } catch {
    return jsonResponse(500, { error: 'Document extraction failed. Check the document and try again.' })
  }
})
