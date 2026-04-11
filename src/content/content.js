function isUsableComposer(element) {
  if (!element || !element.isConnected) {
    return false;
  }

  if (element.getAttribute('contenteditable') === 'false') {
    return false;
  }

  return true;
}

function findComposerInRoot(root) {
  var selectors = [
    'div[data-test-modal][role="dialog"] div.ql-editor[contenteditable="true"]',
    'div.artdeco-modal[role="dialog"] div.ql-editor[contenteditable="true"]',
    'div[data-test-modal][role="dialog"] div[role="textbox"][contenteditable="true"]',
    'div.artdeco-modal[role="dialog"] div[role="textbox"][contenteditable="true"]',
    'div[data-test-modal][role="dialog"] div[data-placeholder*="talk about"][contenteditable="true"]',
    'div.artdeco-modal[role="dialog"] div[data-placeholder*="talk about"][contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    'div[data-placeholder*="talk about"][contenteditable="true"]',
    'div[data-placeholder*="post"][contenteditable="true"]',
    'div[data-placeholder*="share"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[aria-label*="creating content"][role="textbox"]'
  ];
  var i;
  var matches;
  var j;

  for (i = 0; i < selectors.length; i += 1) {
    matches = root.querySelectorAll(selectors[i]);

    for (j = 0; j < matches.length; j += 1) {
      if (isUsableComposer(matches[j])) {
        return matches[j];
      }
    }
  }

  return null;
}

function findLinkedInComposer() {
  var modalRoots = document.querySelectorAll(
    'div[data-test-modal][role="dialog"], div.artdeco-modal[role="dialog"], div.share-box'
  );
  var i;
  var composerEl;

  for (i = 0; i < modalRoots.length; i += 1) {
    composerEl = findComposerInRoot(modalRoots[i]);
    if (composerEl) {
      return composerEl;
    }
  }

  return findComposerInRoot(document);
}

function waitForLinkedInComposer(maxAttempts, delayMs, callback) {
  var attempts = 0;

  function tryFind() {
    var composerEl = findLinkedInComposer();

    if (composerEl) {
      callback(null, composerEl);
      return;
    }

    attempts += 1;

    if (attempts >= maxAttempts) {
      callback(
        new Error(
          "LinkedIn post composer not found. Click 'Start a post' on LinkedIn first, then try inserting."
        )
      );
      return;
    }

    window.setTimeout(tryFind, delayMs);
  }

  tryFind();
}

function insertIntoLinkedInComposer(content, composerEl) {
  try {
    var selection;
    var range;
    var insertWorked = false;
    var nativeTextContentSetter;

    composerEl.focus();

    selection = window.getSelection();
    if (selection) {
      range = document.createRange();
      range.selectNodeContents(composerEl);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    if (typeof document.execCommand === 'function') {
      document.execCommand('selectAll');

      insertWorked = document.execCommand('insertText', false, content);
    }

    if (insertWorked) {
      return;
    }

    nativeTextContentSetter = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      'textContent'
    );

    if (nativeTextContentSetter && typeof nativeTextContentSetter.set === 'function') {
      nativeTextContentSetter.set.call(composerEl, content);
    } else {
      composerEl.textContent = content;
    }

    composerEl.dispatchEvent(
      new Event('input', {
        bubbles: true
      })
    );
    composerEl.dispatchEvent(
      new Event('change', {
        bubbles: true
      })
    );
  } catch (error) {
    throw new Error(error.message || 'Failed to insert content into LinkedIn composer.');
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'INSERT_LINKEDIN_POST') {
    return false;
  }

  if (!findLinkedInComposer()) {
    return false;
  }

  waitForLinkedInComposer(10, 250, function (error, composerEl) {
    if (error) {
      sendResponse({
        error: error.message || 'Failed to insert content into LinkedIn composer.'
      });
      return;
    }

    try {
      insertIntoLinkedInComposer(message.content, composerEl);
      sendResponse({ success: true });
    } catch (insertError) {
      sendResponse({
        error: insertError.message || 'Failed to insert content into LinkedIn composer.'
      });
    }
  });

  return true;
});
