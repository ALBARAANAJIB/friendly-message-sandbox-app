// Prevent multiple script executions
if (window.youtubeEnhancerLoaded) {
  console.log('YouTube Maestro: Script already loaded, skipping subsequent executions.');
} else {
  window.youtubeEnhancerLoaded = true;
  console.log('YouTube Maestro: Content script loaded and initialized.');

  // 1) Your existing history.patch + youtube-url-change listener
  (function() {
    const origPush = history.pushState, origReplace = history.replaceState;
    function fireUrlChange() { window.dispatchEvent(new Event('youtube-url-change')); }
    history.pushState = function(...a){ origPush.apply(this, a); fireUrlChange(); };
    history.replaceState = function(...a){ origReplace.apply(this, a); fireUrlChange(); };
    window.addEventListener('popstate', fireUrlChange);
  })();
  window.addEventListener('youtube-url-change', () => setTimeout(main, 200));

  // 2) URL-polling fallback
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      main();
    }
  }, 300);

  const API_BASE_URL = 'http://localhost:3000/api';

  // --- Core Logic ---
  let isInjecting = false;

  async function main() {
    if (isInjecting) return;
    
    isInjecting = true;
    console.log('YouTube Maestro: Main function triggered for URL:', window.location.href);

    try {
      // *** FIX: Corrected URL check ***
      if (!window.location.href.includes('www.youtube.com')) return;

      await waitForYouTubeReady();

      if (window.location.href.includes('/watch')) {
        await injectSummarizationPanel();
      } else if (window.location.href.includes('/playlist?list=LL')) {
        await injectLikedVideosButtons();
      }
    } catch (error) {
      console.error('YouTube Maestro: Main function error:', error);
    } finally {
      isInjecting = false;
    }
  }

  // --- Helper Functions ---
  
  // Enhanced element detection for YouTube's dynamic DOM
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const checkElement = () => {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) return element;
        return null;
      };

      const element = checkElement();
      if (element) {
        console.log(`YouTube Maestro: Found element immediately: ${selector}`);
        return resolve(element);
      }

      console.log(`YouTube Maestro: Waiting for element: ${selector}`);
      const observer = new MutationObserver(() => {
        const element = checkElement();
        if (element) {
          console.log(`YouTube Maestro: Found element via MutationObserver: ${selector}`);
          observer.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.documentElement, { 
        childList: true, 
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        const finalElement = checkElement();
        if (finalElement) {
          resolve(finalElement);
        } else {
          reject(new Error(`Element ${selector} not found after timeout`));
        }
      }, timeout);
    });
  }

  // Enhanced YouTube readiness detection
  function waitForYouTubeReady() {
    console.log('YouTube Maestro: Checking YouTube readiness...');
    // This function now simply waits for the key element we need to inject our panel into.
    // This is more direct than checking for multiple, unrelated elements.
    return waitForElement('#secondary-inner');
  }

// In content.js

  // --- NEW SIMPLIFIED Summarization Panel Injection ---
  async function injectSummarizationPanel() {
    try {
      console.log('YouTube Maestro: Starting panel injection...');
      
      // --- CHANGE 1: SIMPLIFIED LOGIC ---
      // We now always remove the old panel to ensure a fresh start on every video.
      const existingPanel = document.getElementById('youtube-enhancer-panel');
      if (existingPanel) {
          console.log('YouTube Maestro: Old panel found. Removing it for a clean re-injection.');
          existingPanel.remove();
      }
      // No more complex "reset" logic. We will always create a new panel.
  
      const secondaryColumn = await waitForElement('#secondary-inner');
      if (!secondaryColumn) {
        console.log('YouTube Maestro: Secondary column not found.');
        return;
      }
  
      const panel = document.createElement('div');
      panel.id = 'youtube-enhancer-panel';
      // --- CHANGE 2: ADDED THE MISSING HTML FOR THE LANGUAGE SELECTOR ---
      panel.innerHTML = `
        <div id="enhancer-container">
          <div class="enhancer-header">
            <div class="enhancer-title-group">
              <h3>AI Summary</h3>
            </div>
            <button class="settings-button" id="summary-settings-button">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17-4a4 4 0 0 1-8 0 4 4 0 0 1 8 0zM7 21a4 4 0 0 1-8 0 4 4 0 0 1 8 0z"/>
              </svg>
            </button>
            <div class="settings-dropdown" id="summary-settings-dropdown">
              <div class="setting-item">
                <label>Language:</label>
                <select id="summary-language-select">
                  <option value="English" selected>English</option>
                  <option value="Arabic">العربية</option>
                  <option value="Turkish">Türkçe</option>
                </select>
              </div>
              <div class="setting-item">
                <label>Theme:</label>
                <select id="summary-theme-select">
                  <option value="auto">Auto</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </div>
          <div class="enhancer-content-area">
            <button id="summarize-video-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              <span>Summarize Video</span>
            </button>
            <div id="summary-loading" style="display: none;">
              <div class="enhancer-loader"></div>
              <div id="loading-message"></div>
            </div>
            <div id="summary-content" style="display: none;"></div>
          </div>
        </div>
        <style>
          :root { --accent-color: #FF0000; }
          #enhancer-container {
            --bg-color: #FFFFFF; --text-color: #0f0f0f; --secondary-text-color: #606060;
            --border-color: #e5e5e5; --button-bg-color: #f2f2f2; --button-hover-bg-color: #e5e5e5;
            --scrollbar-thumb-color: #CCCCCC; --error-bg-color: #FFF5F5; --error-border-color: #FECACA;
            --error-text-color: #991B1B; --limit-bg-color: #FFFBEB; --limit-border-color: #FDE68A;
            --limit-text-color: #92400E;
          }
          #enhancer-container[data-theme="dark"] {
            --bg-color: #212121; --text-color: #f1f1f1; --secondary-text-color: #aaaaaa;
            --border-color: #3d3d3d; --button-bg-color: #3F3F3F; --button-hover-bg-color: #5A5A5A;
            --scrollbar-thumb-color: #5A5A5A; --error-bg-color: rgba(153, 27, 27, 0.2);
            --error-border-color: rgba(153, 27, 27, 0.5); --error-text-color: #FCA5A5;
            --limit-bg-color: rgba(146, 64, 14, 0.2); --limit-border-color: rgba(146, 64, 14, 0.5);
            --limit-text-color: #FCD34D;
          }
          #enhancer-container { background: var(--bg-color); color: var(--text-color); border-radius: 12px;
            margin-bottom: 16px; border: 1px solid var(--border-color); font-family: 'Roboto', sans-serif;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); overflow: hidden;
            transition: background-color 0.3s, color 0.3s, border-color 0.3s; }
          .enhancer-header { padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); position: relative; }
          .enhancer-title-group { display: flex; align-items: center; gap: 12px; }
          .enhancer-header h3 { margin: 0; font-size: 16px; font-weight: 500; color: var(--text-color); }
          .settings-button { background: none; border: none; color: var(--text-color); cursor: pointer; padding: 4px; border-radius: 4px; transition: background-color 0.2s; }
          .settings-button:hover { background: var(--button-bg-color); }
          .settings-dropdown { position: absolute; top: 100%; right: 0; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; min-width: 150px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 1000; display: none; }
          .settings-dropdown.show { display: block; }
          .setting-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
          .setting-item:last-child { margin-bottom: 0; }
          .setting-item label { font-size: 12px; color: var(--secondary-text-color); font-weight: 500; }
          .setting-item select { background: var(--button-bg-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; font-size: 11px; }
          .enhancer-content-area { padding: 16px; }
          #summarize-video-btn { 
            width: 100%; background: var(--button-bg-color); color: var(--text-color); border: none;
            margin-top: 16px; /* Added margin to create space */
            border-radius: 18px; padding: 10px 16px; font-size: 14px; font-weight: 500; cursor: pointer;
            transition: background-color 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; 
          }
          #summarize-video-btn:hover { background: var(--button-hover-bg-color); }
          #summary-loading { text-align: center; padding: 16px 0; color: var(--secondary-text-color); }
          .enhancer-loader { width: 24px; height: 24px; margin: 0 auto 16px; border: 2px solid var(--accent-color);
            border-bottom-color: transparent; border-radius: 50%; animation: enhancer-rotation 1s linear infinite; }
          @keyframes enhancer-rotation { 100% { transform: rotate(360deg); } }
        </style>
      `;
  
      secondaryColumn.insertBefore(panel, secondaryColumn.firstChild);
      console.log('YouTube Maestro: Panel injected successfully');

      // The rest of your function that adds event listeners will now work perfectly
      // because it's always operating on a newly created panel.
      const container = document.getElementById('enhancer-container');
      const settingsButton = document.getElementById('summary-settings-button');
      const settingsDropdown = document.getElementById('summary-settings-dropdown');
      const themeSelect = document.getElementById('summary-theme-select');

      const applyTheme = (theme) => {
        if (theme === 'auto') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          container.dataset.theme = prefersDark ? 'dark' : 'light';
        } else {
          container.dataset.theme = theme;
        }
      };

      // Settings dropdown functionality
      settingsButton?.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsDropdown.classList.toggle('show');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!settingsDropdown.contains(e.target) && !settingsButton.contains(e.target)) {
          settingsDropdown.classList.remove('show');
        }
      });

      // Theme change handler
      themeSelect?.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        chrome.storage.local.set({ summary_theme: selectedTheme });
        applyTheme(selectedTheme);
      });

      // Initialize theme
      chrome.storage.local.get('summary_theme', ({ summary_theme }) => {
        if (summary_theme) {
          themeSelect.value = summary_theme;
          applyTheme(summary_theme);
        } else {
          applyTheme('auto');
        }
      });

      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (themeSelect.value === 'auto') {
          applyTheme('auto');
        }
      });

      const summarizeBtn = document.getElementById('summarize-video-btn');
      const loadingDiv = document.getElementById('summary-loading');
      const contentDiv = document.getElementById('summary-content');
      const loadingMessage = document.getElementById('loading-message');

      summarizeBtn?.addEventListener('click', () => {
        summarizeVideo(window.location.href, loadingMessage, contentDiv, loadingDiv, summarizeBtn);
      });

    } catch (error) {
      console.error('YouTube Maestro: Failed to inject summary panel', error);
    }
  }

  // --- Liked Videos Buttons Injection ---
  async function injectLikedVideosButtons() {
    try {
      const existingButtons = document.getElementById('youtube-enhancer-liked-buttons');
      if (existingButtons) {
        existingButtons.remove();
        console.log('YouTube Maestro: Removed old liked videos buttons.');
      }

      const playlistHeader = await waitForElement('#header.ytd-playlist-header-renderer');
      if (!playlistHeader) {
        console.log('YouTube Maestro: Playlist header not found.');
        return;
      }

      const buttonContainer = document.createElement('div');
      buttonContainer.id = 'youtube-enhancer-liked-buttons';
      buttonContainer.innerHTML = `
        <div style="
          display: flex; gap: 12px; margin-top: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', system-ui, sans-serif;
        ">
          <button id="fetch-liked-videos" style="
            background: #f9fafb; color: #374151; border: 1px solid #d1d5db;
            border-radius: 8px; padding: 10px 16px; font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; gap: 6px;
            font-family: inherit;
          " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#f9fafb'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Fetch Videos
          </button>
          <button id="export-liked-videos" style="
            background: #f9fafb; color: #374151; border: 1px solid #d1d5db;
            border-radius: 8px; padding: 10px 16px; font-size: 13px; font-weight: 500;
            cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; gap: 6px;
            font-family: inherit;
          " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#f9fafb'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Export Data
          </button>
        </div>
      `;
      playlistHeader.appendChild(buttonContainer);

      document.getElementById('fetch-liked-videos')?.addEventListener('click', () => {
        if (window.chrome?.runtime) window.chrome.runtime.sendMessage({ action: 'fetchLikedVideos' });
      });

      document.getElementById('export-liked-videos')?.addEventListener('click', () => {
        if (window.chrome?.runtime) window.chrome.runtime.sendMessage({ action: 'exportData' });
      });
    } catch (error) {
      console.error('YouTube Maestro: Failed to inject liked video buttons', error);
    }
  }

  // --- UI/UX Functions ---
  async function summarizeVideo(videoUrl, loadingMessage, contentDiv, loadingDiv, summarizeBtn) {
    const wittyLoadingMessages = [
      "Warming up the thinking cap...",
      "Scanning for brilliant ideas...",
      "Distilling the key points...",
      "Finding the hidden gems...",
      "Assembling the highlights...",
      "Just a moment, magic in progress..."
    ];
    let messageIndex = 0;
    loadingDiv.style.display = 'block';
    summarizeBtn.style.display = 'none';
    contentDiv.style.display = 'none';
    summarizeBtn.disabled = true;

    loadingMessage.textContent = wittyLoadingMessages[messageIndex];
    const loadingInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % wittyLoadingMessages.length;
      loadingMessage.textContent = wittyLoadingMessages[messageIndex];
    }, 2500);

    try {
      const authResponse = await chrome.runtime.sendMessage({ action: 'checkAuth' });
      if (!authResponse || !authResponse.success) {
        throw new Error(authResponse?.needsReauth
          ? 'Your session has expired. Please sign in again via the extension popup.'
          : 'Authentication required. Please sign in via the extension popup to use this feature.');
      }

      const { userId, userInfo, userFullName } = authResponse;

      // START: Get the selected language from the dropdown
      const selectedLanguage = document.getElementById('summary-language-select').value;
      console.log(`YouTube Maestro: Summarizing in ${selectedLanguage}`);
      // END: Get the selected language

      const response = await fetch(`${API_BASE_URL}/summary/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, userId, email: userInfo.email, fullName: userFullName, summaryLanguage: selectedLanguage})
      });

      const data = await response.json();
      clearInterval(loadingInterval);

      if (!response.ok) {
        if (data.code === 'LIMIT_REACHED') {
          showRateLimitError(contentDiv, loadingDiv, summarizeBtn, data);
        } else {
          throw new Error(data.message || 'The summary magic fizzled out. Please try again.');
        }
        return;
      }

      showSuccess(contentDiv, loadingDiv, summarizeBtn, data.summary);
    } catch (error) {
      clearInterval(loadingInterval);
      console.error('❌ Error during summarization:', error);
      showError(contentDiv, loadingDiv, summarizeBtn, error.message);
    }
  }

  function showSuccess(contentDiv, loadingDiv, summarizeBtn, summary) {
    loadingDiv.style.display = 'none';
    summarizeBtn.style.display = 'none';

    function parseEnhancedSummary(text) {
      let html = '';
      const sections = text.split('\n\n');
      sections.forEach(section => {
        const lines = section.trim().split('\n');
        const headerLine = lines.shift();
        const headerMatch = headerLine.match(/^(.*?) \*\*(.*)\*\*$/);

        if (headerMatch) {
          const emoji = headerMatch[1];
          const title = headerMatch[2];
          html += `<div class="summary-section">`;
          html += `<div class="summary-header">
            <span class="summary-emoji">${emoji}</span>
            <span class="summary-title">${title}</span>
          </div>`;
          html += `<ul class="summary-list">`;
          lines.forEach(line => {
            if (line.trim().startsWith('-')) {
              let point = line.trim().substring(1).trim()
                .replace(/\*(.*?)\*/g, '<span class="highlight">$1</span>');
              html += `<li>${point}</li>`;
            }
          });
          html += `</ul></div>`;
        }
      });
      return html;
    }

    const summaryHtml = parseEnhancedSummary(summary);
    contentDiv.innerHTML = `
      <div id="summary-text">${summaryHtml}</div>
      <div style="text-align: right; border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 16px;">
        <button id="copy-summary-btn" style="
          background: var(--button-bg-color); color: var(--secondary-text-color);
          border: none; border-radius: 8px; padding: 8px 12px; font-size: 13px;
          font-weight: 500; cursor: pointer; transition: all 0.2s ease;
          display: inline-flex; align-items: center; gap: 6px;
        ">
          <svg id="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span id="copy-text">Copy</span>
        </button>
      </div>
      <style>
        #summary-text {
          line-height: 1.7; font-size: 14px; max-height: 450px; overflow-y: auto;
          font-family: 'Roboto', sans-serif; scrollbar-width: thin;
          color: var(--text-color); scrollbar-color: var(--scrollbar-thumb-color) transparent;
          padding-right: 12px;
        }
        #summary-text::-webkit-scrollbar { width: 6px; }
        #summary-text::-webkit-scrollbar-track { background: transparent; }
        #summary-text::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb-color); border-radius: 3px; }
        .summary-section { margin-bottom: 16px; }
        .summary-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .summary-emoji { font-size: 18px; }
        .summary-title { font-weight: 600; font-size: 15px; color: var(--text-color); }
        .summary-list { list-style: none; padding-left: 26px; margin: 0; }
        .summary-list li { position: relative; margin-bottom: 6px; color: var(--secondary-text-color); }
        .summary-list li::before {
          content: '•'; position: absolute; left: -16px; top: 0;
          color: var(--text-color); font-weight: bold;
        }
        .highlight {
          color: var(--text-color); background-color: var(--limit-bg-color);
          padding: 1px 4px; border-radius: 4px; font-weight: 500;
        }
        #copy-summary-btn:hover { background: var(--button-hover-bg-color) !important; color: var(--text-color); }
      </style>
    `;
    contentDiv.style.display = 'block';

    document.getElementById('copy-summary-btn')?.addEventListener('click', (e) => {
      navigator.clipboard.writeText(summary);
      const btn = e.currentTarget;
      const icon = btn.querySelector('#copy-icon');
      const text = btn.querySelector('#copy-text');
      icon.innerHTML = `<path d="M20 6L9 17l-5-5" stroke="#4CAF50" />`;
      text.textContent = 'Copied!';
      btn.style.color = '#4CAF50';
      setTimeout(() => {
        icon.innerHTML = `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>`;
        text.textContent = 'Copy';
        btn.style.color = 'var(--secondary-text-color)';
      }, 2000);
    });
  }

  function showError(contentDiv, loadingDiv, summarizeBtn, errorMessage) {
    loadingDiv.style.display = 'none';
    summarizeBtn.style.display = 'none';
    contentDiv.innerHTML = `
      <div style="
        background: var(--error-bg-color); border: 1px solid var(--error-border-color);
        border-radius: 12px; padding: 20px; text-align: center;">
        <h4 style="color: var(--text-color); font-weight: 500; margin: 0 0 8px; font-size: 16px;">Hmm, a slight hiccup...</h4>
        <p style="color: var(--error-text-color); font-size: 13px; margin: 0 0 16px; line-height: 1.5;">${errorMessage}</p>
        <button id="retry-btn" style="
          background: var(--button-bg-color); color: var(--text-color);
          border:none; border-radius:8px; padding: 8px 16px;
          font-size:13px; font-weight:500; cursor:pointer;">Try Again</button>
      </div>
    `;
    contentDiv.style.display = 'block';
    document.getElementById('retry-btn')?.addEventListener('click', () => {
      const loadingMessage = document.getElementById('loading-message');
      summarizeVideo(window.location.href, loadingMessage, contentDiv, loadingDiv, summarizeBtn);
    });
  }

  function showRateLimitError(contentDiv, loadingDiv, summarizeBtn, errorData) {
    loadingDiv.style.display = 'none';
    summarizeBtn.style.display = 'none';
    contentDiv.innerHTML = `
      <div style="
        background: var(--limit-bg-color); border: 1px solid var(--limit-border-color);
        border-radius: 12px; padding: 20px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 12px;">⏰</div>
        <h4 style="color: var(--text-color); font-weight: 600; margin: 0 0 8px; font-size: 16px;">You're on a roll!</h4>
        <p style="color: var(--limit-text-color); font-size: 13px; margin: 0 0 16px; line-height: 1.5;">${errorData.message}</p>
        <button id="upgrade-btn" style="
          width: 100%; background: #FBBF24; color: #78350F; border:none; border-radius:8px;
          padding: 10px 16px; font-size:14px; font-weight:600; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.243 13.06L12 18.028l-4.243-2.968C6.632 14.162 6 12.89 6 11.5c0-1.29.588-2.48 1.5-3.357C8.412 7.218 9.645 6.5 11 6.5c1.47 0 2.5.588 3.5 1.5.912.877 1.5 2.067 1.5 3.5 0 1.39-.632 2.662-1.757 3.56z"/></svg>
          Upgrade to Pioneer Access
        </button>
      </div>
    `;
    contentDiv.style.display = 'block';
    document.getElementById('upgrade-btn')?.addEventListener('click', () => {
      const loadingMessage = document.getElementById('loading-message');
      errorData.message = 'Pioneer Access is a limited-time offer coming soon to early supporters!';
      showError(contentDiv, loadingDiv, summarizeBtn, errorData.message);
    });
  }

  // --- Extension Initialization ---
  function initializeExtension() {
    console.log('YouTube Maestro: Initializing...');

    const debounce = (func, wait) => {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
      };
    };

    const handleNavigation = debounce((event) => {
      if (isInjecting) return;
      main(event);
    }, 10);

    document.addEventListener('yt-navigate-finish', handleNavigation, { passive: true });

    // Initial load handling - use debounced function to maintain consistency
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      setTimeout(() => handleNavigation(null), 100);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => handleNavigation(null), 100);
      }, { once: true });
    }
  }

  initializeExtension();

} // End of script execution guard