import { NextResponse } from 'next/server';

// Helper function to create AbortController with timeout
function createTimeoutController(timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

export async function POST(request) {
  let timeoutId;
  
  try {
    // Parse the request body with timeout protection
    let message;
    try {
      const body = await request.json();
      message = body.message;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
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

    // Create timeout controller (30 seconds timeout)
    const { controller, timeoutId: timeout } = createTimeoutController(30000);
    timeoutId = timeout;

    // Prepare the request to OpenRouter API with timeout
    let openRouterResponse;
    try {
      openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        signal: controller.signal, // Add timeout signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Handle different types of fetch errors
      if (fetchError.name === 'AbortError') {
        console.error('Request timeout:', fetchError);
        return NextResponse.json(
          { error: 'Request timed out. Please try again.' },
          { status: 408 }
        );
      }
      
      if (fetchError.code === 'ECONNREFUSED' || fetchError.code === 'ENOTFOUND') {
        console.error('Connection error:', fetchError);
        return NextResponse.json(
          { error: 'Unable to connect to AI service. Please try again later.' },
          { status: 503 }
        );
      }
      
      if (fetchError.code === 'ETIMEDOUT') {
        console.error('Connection timeout:', fetchError);
        return NextResponse.json(
          { error: 'Connection timed out. Please try again.' },
          { status: 504 }
        );
      }
      
      // Generic network error
      console.error('Network error:', fetchError);
      return NextResponse.json(
        { error: 'Network error occurred. Please check your connection and try again.' },
        { status: 502 }
      );
    }

    // Clear timeout since request completed
    clearTimeout(timeoutId);

    // Check if the OpenRouter API request was successful
    if (!openRouterResponse.ok) {
      let errorData;
      try {
        errorData = await openRouterResponse.text();
      } catch (textError) {
        errorData = 'Unable to read error response';
      }
      
      console.error('OpenRouter API error:', {
        status: openRouterResponse.status,
        statusText: openRouterResponse.statusText,
        error: errorData
      });
      
      // Handle specific HTTP status codes
      if (openRouterResponse.status === 401) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your configuration.' },
          { status: 401 }
        );
      }
      
      if (openRouterResponse.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      
      if (openRouterResponse.status >= 500) {
        return NextResponse.json(
          { error: 'AI service is temporarily unavailable. Please try again later.' },
          { status: 503 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to get response from AI service' },
        { status: openRouterResponse.status }
      );
    }

    // Parse the response from OpenRouter
    let data;
    try {
      data = await openRouterResponse.json();
    } catch (jsonError) {
      console.error('JSON parse error from OpenRouter:', jsonError);
      return NextResponse.json(
        { error: 'Invalid response from AI service' },
        { status: 502 }
      );
    }
    
    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Invalid response structure:', data);
      return NextResponse.json(
        { error: 'Unexpected response format from AI service' },
        { status: 502 }
      );
    }
    
    // Return the AI response
    return NextResponse.json({
      success: true,
      response: data.choices[0]?.message?.content || 'No response generated',
      usage: data.usage,
    });

  } catch (error) {
    // Clear timeout if it exists
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    console.error('Chat API error:', error);
    
    // Handle specific error types
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return NextResponse.json(
        { error: 'Network error. Please check your internet connection.' },
        { status: 502 }
      );
    }
    
    if (error.name === 'SyntaxError') {
      return NextResponse.json(
        { error: 'Invalid response format received.' },
        { status: 502 }
      );
    }
    
    // Generic error fallback
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
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
