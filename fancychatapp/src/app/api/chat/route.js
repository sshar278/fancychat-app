import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Parse the request body
    const { message } = await request.json();
    
    // Validate the request body
    if (!message || !Array.isArray(message)) {
      return NextResponse.json(
        { error: 'Invalid request. Expected {message: []} in body' },
        { status: 400 }
      );
    }

    // Check if OpenRouter API key is configured
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    // Prepare the request to OpenRouter API
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': process.env.APP_NAME || 'FancyChat App',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo', // You can change this to any supported model
        messages: message,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    // Check if the OpenRouter API request was successful
    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.text();
      console.error('OpenRouter API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get response from AI service' },
        { status: openRouterResponse.status }
      );
    }

    // Parse the response from OpenRouter
    const data = await openRouterResponse.json();
    
    // Return the AI response
    return NextResponse.json({
      success: true,
      response: data.choices[0]?.message?.content || 'No response generated',
      usage: data.usage,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST instead.' },
    { status: 405 }
  );
}
