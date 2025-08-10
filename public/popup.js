
document.addEventListener('DOMContentLoaded', () => {
  const loginButton = document.getElementById('login-button');
  const loginContainer = document.getElementById('login-container');
  const featuresContainer = document.getElementById('features-container');
  const fetchVideosButton = document.getElementById('fetch-videos');
  const openDashboardButton = document.getElementById('open-dashboard');
  const exportDataButton = document.getElementById('export-data');
  const aiSummaryButton = document.getElementById('ai-summary');
  const signOutButton = document.getElementById('sign-out');
  const userEmail = document.getElementById('user-email');
  const userInitial = document.getElementById('user-initial');
  const userAvatar = document.getElementById('user-avatar');
  const settingsButton = document.getElementById('settings-button');
  const settingsDropdown = document.getElementById('settings-dropdown');
  const themeSelect = document.getElementById('theme-select');

  // Initialize theme and language
  initializeSettings();

  // Check authentication status using background script validation
  chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
    if (response && response.success && response.userInfo) {
      loginContainer.style.display = 'none';
      featuresContainer.style.display = 'block';
      
      displayUserInfo(response.userInfo);
    } else {
      loginContainer.style.display = 'block';
      featuresContainer.style.display = 'none';
      
      // --- THIS IS THE KEY CHANGE fr the error message for new users
      // Only show the error message if the session has actually expired.
      if (response && response.reason === 'EXPIRED_TOKEN') {
        showErrorMessage('Your session has expired. Please sign in again.');
      }
      // For a 'NO_TOKEN' reason (new user), no error will be shown.
    }

 // --- ADD THESE LINES to fix the buffering issue we talked about. //
    // Reveal the body now that the correct view is set
    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';

  });

  // Login with YouTube
  loginButton && loginButton.addEventListener('click', () => {
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    
    chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
      if (response && response.success) {
        loginContainer.style.display = 'none';
        featuresContainer.style.display = 'block';
        
        if (response.userInfo) {
          displayUserInfo(response.userInfo);
        }
      } else {
        showErrorMessage('Authentication failed. Please try again.');
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in with YouTube';
      }
    });
  });

  // Fetch liked videos
  fetchVideosButton && fetchVideosButton.addEventListener('click', () => {
    fetchVideosButton.disabled = true;
    const originalText = fetchVideosButton.textContent;
    fetchVideosButton.textContent = 'Fetching...';
    
    chrome.runtime.sendMessage({ action: 'fetchLikedVideos' }, (response) => {
      fetchVideosButton.disabled = false;
      fetchVideosButton.textContent = originalText;
      
      if (response && response.success) {
        showSuccessMessage(fetchVideosButton, `${response.count} videos fetched!`);
      } else if (response && response.needsReauth) {
        showErrorMessage('Your session has expired. Please sign in again.');
        // Switch back to login view
        loginContainer.style.display = 'block';
        featuresContainer.style.display = 'none';
      } else {
        showErrorMessage(response?.error || 'Failed to fetch videos. Please try again.');
      }
    });
  });

  // Open dashboard
  openDashboardButton && openDashboardButton.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  // Export data
  exportDataButton && exportDataButton.addEventListener('click', () => {
    exportDataButton.disabled = true;
    const originalText = exportDataButton.textContent;
    exportDataButton.textContent = 'Exporting...';
    
    chrome.runtime.sendMessage({ action: 'exportData' }, (response) => {
      setTimeout(() => {
        exportDataButton.disabled = false;
        exportDataButton.textContent = originalText;
        
        if (response && response.success) {
          showSuccessMessage(exportDataButton, `${response.count} videos exported!`);
        } else if (response && response.needsReauth) {
          showErrorMessage('Your session has expired. Please sign in again.');
          // Switch back to login view
          loginContainer.style.display = 'block';
          featuresContainer.style.display = 'none';
        } else {
          showErrorMessage(response?.error || 'Export failed. Please try again.');
          console.error('Export failed:', response?.error || 'Unknown error');
        }
      }, 1000);
    });
  });

  // AI Summary
  aiSummaryButton && aiSummaryButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url && currentTab.url.includes('youtube.com/watch')) {
        showSuccessMessage(aiSummaryButton, "Summarization panel is now available on the video page!");
        window.close();
      } else {
        chrome.tabs.create({ 
          url: chrome.runtime.getURL('dashboard.html?tab=ai') 
        });
      }
    });
  });

  // Sign out
  signOutButton && signOutButton.addEventListener('click', () => {
    chrome.storage.local.remove(['userToken', 'userInfo', 'userId', 'tokenExpiry', 'likedVideos'], () => {
      loginContainer.style.display = 'block';
      featuresContainer.style.display = 'none';
    });
  });
  
  // Helper functions
  function displayUserInfo(userInfo) {
    if (userInfo.email) {
      userEmail.textContent = userInfo.email;
      userInitial.textContent = userInfo.email.charAt(0).toUpperCase();
    } else if (userInfo.name) {
      userEmail.textContent = userInfo.name;
      userInitial.textContent = userInfo.name.charAt(0).toUpperCase();
    }
    
    // Handle profile picture
    if (userInfo.picture) {
      userAvatar.src = userInfo.picture;
      userAvatar.style.display = 'block';
      userInitial.style.display = 'none';
      
      // Fallback to initials if image fails to load
      userAvatar.onerror = () => {
        userAvatar.style.display = 'none';
        userInitial.style.display = 'block';
      };
    } else {
      userAvatar.style.display = 'none';
      userInitial.style.display = 'block';
    }
  }

  function showSuccessMessage(element, message) {
    const successMessage = document.createElement('div');
    successMessage.classList.add('success-message');
    successMessage.textContent = message;
    
    element.parentNode.insertBefore(successMessage, element.nextSibling);
    
    setTimeout(() => {
      successMessage.remove();
    }, 3000);
  }
  
  function showErrorMessage(message) {
    const errorMessage = document.createElement('div');
    errorMessage.classList.add('error-message');
    errorMessage.style.color = '#ff3333';
    errorMessage.style.padding = '8px';
    errorMessage.style.margin = '8px 0';
    errorMessage.style.borderRadius = '4px';
    errorMessage.style.backgroundColor = 'rgba(255,0,0,0.1)';
    errorMessage.textContent = message;
    
    const container = loginContainer.style.display === 'none' ? featuresContainer : loginContainer;
    container.insertBefore(errorMessage, container.firstChild);
    
    setTimeout(() => {
      errorMessage.remove();
    }, 5000);
  }

  // Settings functionality
  function initializeSettings() {
    // Load saved settings
    chrome.storage.local.get(['theme'], (result) => {
      if (result.theme) {
        themeSelect.value = result.theme;
        applyTheme(result.theme);
      } else {
        // Default to auto theme
        applyTheme('auto');
      }
    });
  }

  function applyTheme(theme) {
    if (theme === 'auto') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  // Settings button toggle
  settingsButton && settingsButton.addEventListener('click', (e) => {
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
  themeSelect && themeSelect.addEventListener('change', (e) => {
    const selectedTheme = e.target.value;
    chrome.storage.local.set({ theme: selectedTheme });
    applyTheme(selectedTheme);
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (themeSelect.value === 'auto') {
      applyTheme('auto');
    }
  });
});
