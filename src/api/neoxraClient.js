async function runNeoxra(idea, onStatus, onComplete, onError) {
  var criticResult = null;
  var pass2Result = null;
  var pass1Result = null;
  var completed = false;
  var decoder = new TextDecoder();
  var buffer = '';

  function safeStatus(message) {
    if (typeof onStatus === 'function') {
      onStatus(message);
    }
  }

  function safeComplete(content) {
    if (completed) {
      return;
    }

    completed = true;

    if (typeof onComplete === 'function') {
      onComplete(content);
    }
  }

  function safeError(message) {
    if (completed) {
      return;
    }

    completed = true;

    if (typeof onError === 'function') {
      onError(message);
    }
  }

  function parseEventBlock(block) {
    var lines = block.split('\n');
    var eventName = '';
    var dataLines = [];
    var i;

    for (i = 0; i < lines.length; i += 1) {
      if (lines[i].indexOf('event:') === 0) {
        eventName = lines[i].slice(6).trim();
      } else if (lines[i].indexOf('data:') === 0) {
        dataLines.push(lines[i].slice(5).trim());
      }
    }

    return {
      event: eventName,
      data: dataLines.join('\n')
    };
  }

  function parseJsonData(dataText, eventName) {
    if (!dataText) {
      return null;
    }

    try {
      return JSON.parse(dataText);
    } catch (error) {
      throw new Error('Failed to parse SSE data for event: ' + eventName);
    }
  }

  function processEvent(eventName, dataText) {
    var parsedData = null;

    if (eventName === 'planner_started') {
      safeStatus('Planning your idea...');
      return;
    }

    if (eventName === 'planner_completed') {
      safeStatus('Brief ready. Generating LinkedIn post...');
      return;
    }

    if (eventName === 'linkedin_pass1_started') {
      safeStatus('Writing first draft...');
      return;
    }

    if (eventName === 'linkedin_pass2_started') {
      safeStatus('Refining post...');
      return;
    }

    if (eventName === 'critic_started') {
      safeStatus('Reviewing for brand voice...');
      return;
    }

    if (
      eventName === 'critic_completed' ||
      eventName === 'linkedin_pass2_completed' ||
      eventName === 'linkedin_pass1_completed'
    ) {
      parsedData = parseJsonData(dataText, eventName);
    }

    if (eventName === 'critic_completed') {
      if (parsedData && parsedData.linkedin_improved) {
        criticResult = parsedData.linkedin_improved;
      }
      return;
    }

    if (eventName === 'linkedin_pass2_completed') {
      if (parsedData && parsedData.output) {
        pass2Result = parsedData.output;
      }
      return;
    }

    if (eventName === 'linkedin_pass1_completed') {
      if (parsedData && parsedData.output) {
        pass1Result = parsedData.output;
      }
      return;
    }

    if (eventName === 'pipeline_completed') {
      if (criticResult) {
        safeComplete(criticResult);
        return;
      }

      if (pass2Result) {
        safeComplete(pass2Result);
        return;
      }

      if (pass1Result) {
        safeComplete(pass1Result);
        return;
      }

      safeError('No LinkedIn content generated');
    }
  }

  try {
    var response = await fetch(NEOXRA_BASE_URL + '/api/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        idea: idea,
        voice_profile: 'default'
      })
    });

    if (!response.ok) {
      safeError('Request failed with status ' + response.status);
      return;
    }

    if (!response.body) {
      safeError('Streaming response not available');
      return;
    }

    var reader = response.body.getReader();

    while (!completed) {
      var chunkResult;

      try {
        chunkResult = await reader.read();
      } catch (error) {
        safeError('Failed to read response stream');
        return;
      }

      if (chunkResult.done) {
        break;
      }

      buffer += decoder.decode(chunkResult.value, { stream: true });

      var blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      var i;
      for (i = 0; i < blocks.length; i += 1) {
        var block = blocks[i].trim();
        var parsedEvent;

        if (!block) {
          continue;
        }

        parsedEvent = parseEventBlock(block);

        try {
          processEvent(parsedEvent.event, parsedEvent.data);
        } catch (error) {
          safeError(error.message || 'Failed to process Neoxra stream');
          return;
        }
      }
    }

    if (!completed && buffer.trim()) {
      try {
        var finalEvent = parseEventBlock(buffer.trim());
        processEvent(finalEvent.event, finalEvent.data);
      } catch (error) {
        safeError(error.message || 'Failed to process Neoxra stream');
        return;
      }
    }

    if (!completed) {
      if (criticResult) {
        safeComplete(criticResult);
        return;
      }

      if (pass2Result) {
        safeComplete(pass2Result);
        return;
      }

      if (pass1Result) {
        safeComplete(pass1Result);
        return;
      }

      safeError('No LinkedIn content generated');
    }
  } catch (error) {
    safeError('Failed to reach Neoxra: ' + error.message);
  }
}
