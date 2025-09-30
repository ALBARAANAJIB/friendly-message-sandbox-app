// Enhanced YouTube Maestro Background Script with Token Refresh and Persistence
console.log('🚀 YouTube Maestro background script loaded');

// OAuth 2.0 constants
const CLIENT_ID = '304162096302-4mpo9949jogs1ptnpmc0s4ipkq53dbsm.apps.googleusercontent.com';
const REDIRECT_URL = chrome.identity.getRedirectURL();
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];



// YouTube API endpoints
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const VIDEOS_ENDPOINT = `${API_BASE}/videos`;
const CHANNELS_ENDPOINT = `${API_BASE}/channels`;
const PLAYLIST_ITEMS_ENDPOINT = `${API_BASE}/playlistItems`;

// Set up extension installation/startup
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('📦 Extension installed successfully');
    console.log('🔗 OAuth Redirect URL:', REDIRECT_URL);
  }
});



// NEW: Token validation and refresh utility
async function validateAndRefreshToken() {
  try {
    console.log('🔍 Validating stored token...');
    
    // Retrieve all relevant user data from storage
    const storage = await chrome.storage.local.get(['userToken', 'tokenExpiry', 'userInfo', 'userId', 'userFullName']); // Ensure all needed fields are retrieved
    
    if (!storage.userToken) {
      console.log('❌ No token found');
      return { valid: false, reason: 'NO_TOKEN' };
    }
    
    // Check if token is expired (with 5-minute buffer)
    const now = Date.now();
    const expiryTime = storage.tokenExpiry || 0;
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    
    if (expiryTime && now > (expiryTime - bufferTime)) {
      console.log('⏰ Token is expired or about to expire, refreshing...');
      // A failed refresh means the session is truly expired.
      const refreshResult = await refreshToken();
      // Ensure refreshResult correctly propagates needsAuth
      return refreshResult.valid 
        ? refreshResult 
        : { valid: false, reason: 'EXPIRED_TOKEN', needsAuth: refreshResult.needsAuth }; 
    }
    
    // Test token validity with a simple API call
    try {
      const testResponse = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        headers: { 'Authorization': `Bearer ${storage.userToken}` }
      });
      
      if (testResponse.ok) {
        const tokenInfo = await testResponse.json();
        console.log('✅ Token is valid, expires in:', tokenInfo.expires_in, 'seconds');
        
        // Update expiry time based on API response
        if (tokenInfo.expires_in) {
          const newExpiry = now + (tokenInfo.expires_in * 1000);
          await chrome.storage.local.set({ tokenExpiry: newExpiry });
        }
        
        // If valid, return the full stored user data for consistency
        return { 
          valid: true, 
          token: storage.userToken, 
          userId: storage.userId, 
          userInfo: storage.userInfo, 
          userFullName: storage.userFullName 
        };
      } else {
        console.log('❌ Token validation failed, needs refresh');
        // Attempt refresh if validation fails, ensure needsAuth is propagated
        const refreshResult = await refreshToken();
        return refreshResult;
      }
    } catch (error) {
      console.log('❌ Token validation error during test:', error.message);
      // If the test fetch itself fails (e.g., network error), try to refresh
      const refreshResult = await refreshToken();
      return refreshResult;
    }
    
  } catch (error) {
    console.error('❌ General token validation error:', error);
    // If any unhandled error occurs, assume re-authentication is needed
    return { valid: false, needsAuth: true };
  }
}

// NEW: Token refresh function
async function refreshToken() {
  try {
    console.log('🔄 Attempting to refresh token...');
    
    // --- START FIX 1: Remove problematic token clearing at the start of refresh. Chrome Identity manages its own cache. ---
    // await chrome.storage.local.remove(['userToken', 'tokenExpiry', 'userFullName']); // REMOVED THIS LINE
    // --- END FIX 1 ---
    
    // Use Chrome Identity API to get a fresh token
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ 
        interactive: false, // Don't show UI for silent refresh
        scopes: SCOPES 
      }, (token) => {
        if (chrome.runtime.lastError || !token) {
          console.log('🔄 Silent refresh failed, will need interactive auth');
          resolve(null); // Indicates silent refresh failed
        } else {
          resolve(token); // New token obtained
        }
      });
    });
    
    if (token) {
      console.log('✅ Token refreshed successfully');
      
      // Get token expiry information
      const tokenInfoResponse = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let expiry = Date.now() + (3600 * 1000); // Default 1 hour
      if (tokenInfoResponse.ok) {
        const tokenInfo = await tokenInfoResponse.json();
        if (tokenInfo.expires_in) {
          expiry = Date.now() + (tokenInfo.expires_in * 1000);
        }
      }
      
      // --- START FIX 2: Fetch userInfo and derive userFullName *after* getting a new token ---
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let userInfo = {}; // Initialize userInfo
      let userFullName = ''; // Initialize userFullName
      if (userInfoResponse.ok) {
        userInfo = await userInfoResponse.json();
        // --- START FIX 3: Corrected typo from is_pioneer to family_name ---
        userFullName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(); 
        // --- END FIX 3 ---
      } else {
          console.warn('⚠️ Failed to fetch user info during token refresh. User data might be incomplete.');
      }
      // --- END FIX 2 ---

      // Store ALL relevant user data (including the newly fetched/derived ones)
      await chrome.storage.local.set({ 
        userToken: token, 
        tokenExpiry: expiry,
        userInfo: userInfo,         // Store updated userInfo
        userId: userInfo.id,        // Store updated userId
        userFullName: userFullName  // Store updated userFullName
      });
      
      // --- START FIX 4: Return full user data for consistency ---
      return { 
        valid: true, 
        token: token, 
        userId: userInfo.id, 
        userInfo: userInfo, 
        userFullName: userFullName 
      };
      // --- END FIX 4 ---
    } else {
      console.log('❌ Token refresh failed, needs interactive auth');
      return { valid: false, needsAuth: true }; // Indicate interactive auth is required
    }
    
  } catch (error) {
    console.error('❌ Token refresh process error:', error);
    return { valid: false, needsAuth: true }; // General error during refresh, assume re-auth needed
  }
}

// ENHANCED: Authentication with better token handling and expiry tracking
async function authenticateWithYouTube() {
  try {
    console.log('🔐 Starting YouTube authentication with Chrome Identity API...');

    // --- START FIX 5: If validateAndRefreshToken returns valid, use its comprehensive result directly ---
    const tokenCheck = await validateAndRefreshToken();
    if (tokenCheck.valid) {
      console.log('✅ Using existing valid token');
      return tokenCheck; // Return the full data obtained from validateAndRefreshToken
    }
    // --- END FIX 5 ---

    // If tokenCheck is not valid, proceed with interactive authentication
    // Clear any existing invalid tokens/user data before interactive login
    await chrome.storage.local.remove(['userToken', 'userInfo', 'userId', 'tokenExpiry', 'userFullName']);

    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ 
        interactive: true, // Force interactive login for first time or re-auth
        scopes: SCOPES 
      }, (token) => {
        if (chrome.runtime.lastError || !token) {
          return reject(new Error(chrome.runtime.lastError?.message || 'Failed to get auth token.'));
        }
        resolve(token);
      });
    });

    // Get token expiry information
    const tokenInfoResponse = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let expiry = Date.now() + (3600 * 1000); // Default 1 hour
    if (tokenInfoResponse.ok) {
      const tokenInfo = await tokenInfoResponse.json();
      if (tokenInfo.expires_in) {
        expiry = Date.now() + (tokenInfo.expires_in * 1000);
      }
    }

    // Fetch user info using the token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info.');
    }
    
    const userInfo = await userInfoResponse.json();
    // This variable 'userFullName' is correctly defined here for this scope
    const userFullName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(); 
   

    // Store user data with expiry
    await chrome.storage.local.set({ 
      userToken: token, 
      userInfo: userInfo, 
      userId: userInfo.id,
      userFullName: userFullName, // This is correct
      tokenExpiry: expiry,
      // --- START FIX 6: Removed duplicate userFullName storage and added lastAuthTime correctly ---
      // userFullName: userFullName, // REMOVED THIS DUPLICATE LINE
      lastAuthTime: Date.now()
      // --- END FIX 6 ---
    });
    
    console.log('✅ User authenticated and info stored:', userInfo);
    console.log('⏰ Token expires at:', new Date(expiry).toLocaleString());
    
    // Return all necessary user data for popup.js and other parts
    return { success: true, userInfo: userInfo, userId: userInfo.id, userFullName: userFullName };

  } catch (error) {
    console.error('❌ Authentication error:', error);

    // --- START: NEW SELF-HEALING LOGIC ---
    // If the error was failing to fetch user info, the token might be stale.
    // We will remove it from the cache and try ONE more time.
    if (error.message.includes('Failed to fetch user info')) {
        console.log('🔄 User info fetch failed. Attempting to clear cached token and retry...');
        try {
            // Get the token that just failed
            const { token: badToken } = await new Promise((resolve, reject) => {
              chrome.identity.getAuthToken({ interactive: false }, (result) => {
                if (chrome.runtime.lastError || !result) reject(new Error('Could not get token to remove.'));
                else resolve({token: result});
              });
            });

            // Remove it from Chrome's cache
            if(badToken) {
              await new Promise((resolve, reject) => {
                  chrome.identity.removeCachedAuthToken({ token: badToken }, resolve);
              });
              console.log('✅ Stale token removed from cache. Retrying authentication...');
            }

            // Now, retry the entire authentication function.
            // We return the result of this second attempt.
            return await authenticateWithYouTube();

        } catch (retryError) {
            console.error('❌ Retry authentication also failed:', retryError);
            return { success: false, error: retryError.message, needsReauth: true };
        }
    }
    // --- END: NEW SELF-HEALING LOGIC ---

    // Explicitly return needsReauth on failure during interactive authentication
    return { success: false, error: error.message, needsReauth: true }; 
  }
}

// ENHANCED: All API calls now use token validation
async function makeAuthenticatedRequest(url, options = {}) {
  try {
    // Validate token before making request
    const tokenCheck = await validateAndRefreshToken();
    
    if (!tokenCheck.valid) {
      // Propagate the needsAuth flag from tokenCheck
      if (tokenCheck.needsAuth) {
        throw new Error('NEEDS_REAUTH');
      } else {
        throw new Error('Token validation failed'); // Generic failure
      }
    }
    
    // Make the request with the validated token
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${tokenCheck.token}`,
        'Accept': 'application/json'
      }
    });
    
    // Handle token expiry during request
    if (response.status === 401) {
      console.log('🔄 Request returned 401, token may be expired');
      
      // Try to refresh token one more time
      const refreshResult = await refreshToken();
      if (refreshResult.valid) {
        // Retry the request with new token
        return await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${refreshResult.token}`,
            'Accept': 'application/json'
          }
        });
      } else {
        throw new Error('NEEDS_REAUTH'); // Refresh failed, interactive auth needed
      }
    }
    
    return response;
    
  } catch (error) {
    if (error.message === 'NEEDS_REAUTH') {
      throw error; // Re-throw to be caught by higher level functions
    }
    console.error('❌ Authenticated request error:', error);
    throw error;
  }
}

// UPDATED: Use the new authenticated request function
async function getLikedPlaylistId() {
  try {
    console.log('🔍 Attempting to get liked videos playlist ID...');
    
    const channelResponse = await makeAuthenticatedRequest(
      `${CHANNELS_ENDPOINT}?part=contentDetails,snippet&mine=true`
    );
    
    if (!channelResponse.ok) {
      const errorText = await channelResponse.text();
      console.error('❌ Channel API error:', channelResponse.status, errorText);
      
      if (channelResponse.status === 403) {
        console.log('🔄 Channel access denied, trying alternative approach...');
        throw new Error('CHANNEL_ACCESS_DENIED');
      }
      
      throw new Error(`Failed to get channel info: ${channelResponse.status} - ${errorText}`);
    }
    
    const channelData = await channelResponse.json();
    console.log('📺 Channel data received:', channelData);
    
    if (!channelData.items || channelData.items.length === 0) {
      console.log('⚠️ No channel found, trying alternative approach...');
      throw new Error('NO_CHANNEL_FOUND');
    }
    
    const channel = channelData.items[0];
    const likedPlaylistId = channel.contentDetails?.relatedPlaylists?.likes;
    
    if (!likedPlaylistId) {
      console.log('⚠️ No liked playlist ID found, trying alternative approach...');
      throw new Error('NO_LIKED_PLAYLIST');
    }
    
    console.log('✅ Found liked playlist ID:', likedPlaylistId);
    
    // Test playlist access
    const testResponse = await makeAuthenticatedRequest(
      `${PLAYLIST_ITEMS_ENDPOINT}?part=snippet&playlistId=${likedPlaylistId}&maxResults=1`
    );
    
    if (!testResponse.ok) {
      console.log('⚠️ Playlist access test failed, trying alternative approach...');
      throw new Error('PLAYLIST_ACCESS_DENIED');
    }
    
    console.log('✅ Playlist access confirmed');
    return likedPlaylistId;
    
  } catch (error) {
    console.log('❌ Primary method failed:', error.message);
    throw error;
  }
}


// UPDATED: Helper functions with new authentication
// UPDATED: Helper function with 404 pagination fix
async function fetchVideosFromPlaylist(playlistId, pageToken = null) {
  console.log('📋 Fetching from playlist:', playlistId, pageToken ? `page: ${pageToken}` : 'first page');
  
  let url = `${PLAYLIST_ITEMS_ENDPOINT}?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }
  
  const playlistResponse = await makeAuthenticatedRequest(url);
  
  if (!playlistResponse.ok) {
    const errorText = await playlistResponse.text();
    console.error('Playlist API error:', playlistResponse.status, errorText);
    
    // *** FIX: Detect 404 errors during pagination and trigger fallback ***
    if (playlistResponse.status === 404) {
      console.log('⚠️ Playlist 404 during pagination - this is a YouTube API limitation for large playlists');
      // Throw a specific error that will trigger the fallback mechanism
      throw new Error('PLAYLIST_PAGINATION_FAILED');
    }
    
    throw new Error(`Failed to fetch liked videos playlist: ${playlistResponse.status} - ${errorText}`);
  }
  
  const playlistData = await playlistResponse.json();
  console.log('📋 Playlist data:', playlistData);
  
  if (!playlistData.items || playlistData.items.length === 0) {
    console.log('📋 Playlist is empty or no items returned');
    return {
      videos: [],
      nextPageToken: null,
      totalResults: playlistData.pageInfo?.totalResults || 0
    };
  }
  
  // Extract video IDs and get detailed information
  const videoIds = playlistData.items.map(item => item.contentDetails.videoId).join(',');
  console.log('🆔 Video IDs to fetch:', videoIds);
  
  const videosResponse = await makeAuthenticatedRequest(
    `${VIDEOS_ENDPOINT}?part=snippet,statistics,contentDetails&id=${videoIds}`
  );
  
  if (!videosResponse.ok) {
    const errorText = await videosResponse.text();
    console.error('Videos API error:', videosResponse.status, errorText);
    throw new Error(`Failed to fetch video details: ${videosResponse.status}`);
  }
  
  const videosData = await videosResponse.json();
  console.log('📹 Videos data:', videosData);
  
  // Process videos
  const videos = playlistData.items.map(playlistItem => {
    const videoDetails = videosData.items.find(video => video.id === playlistItem.contentDetails.videoId);
    
    if (!videoDetails) {
      console.warn('⚠️ Video details not found for:', playlistItem.contentDetails.videoId);
      return null;
    }
    
    return {
      id: videoDetails.id,
      title: videoDetails.snippet.title,
      channelTitle: videoDetails.snippet.channelTitle,
      channelId: videoDetails.snippet.channelId,
      publishedAt: videoDetails.snippet.publishedAt,
      likedAt: playlistItem.snippet.publishedAt,
      thumbnail: videoDetails.snippet.thumbnails.medium?.url || videoDetails.snippet.thumbnails.default?.url || '',
      viewCount: videoDetails.statistics?.viewCount || '0',
      likeCount: videoDetails.statistics?.likeCount || '0',
      duration: videoDetails.contentDetails?.duration || '',
      url: `https://www.youtube.com/watch?v=${videoDetails.id}`
    };
  }).filter(video => video !== null);
  
  console.log(`✅ Processed ${videos.length} videos from playlist`);
  
  return {
    videos: videos,
    nextPageToken: playlistData.nextPageToken || null,
    totalResults: playlistData.pageInfo?.totalResults || videos.length
  };
}

// Add this function after fetchVideosFromPlaylist and before exportLikedVideos
async function fetchLikedVideosViaRating(pageToken = null) {
  console.log('⭐ Attempting to find liked videos via myRating parameter...', pageToken ? `page: ${pageToken}` : 'first page');
  
  let url = `${VIDEOS_ENDPOINT}?part=snippet,statistics,contentDetails&myRating=like&maxResults=50`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }
  
  const response = await makeAuthenticatedRequest(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('MyRating API error:', response.status, errorText);
    throw new Error(`Failed to fetch liked videos via rating: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('⭐ MyRating response:', data);
  
  if (!data.items || data.items.length === 0) {
    return {
      videos: [],
      nextPageToken: null,
      totalResults: data.pageInfo?.totalResults || 0
    };
  }
  
  const videos = data.items.map(video => ({
    id: video.id,
    title: video.snippet.title,
    channelTitle: video.snippet.channelTitle,
    channelId: video.snippet.channelId,
    publishedAt: video.snippet.publishedAt,
    likedAt: video.snippet.publishedAt,
    thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default?.url || '',
    viewCount: video.statistics?.viewCount || '0',
    likeCount: video.statistics?.likeCount || '0',
    duration: video.contentDetails?.duration || '',
    url: `https://www.youtube.com/watch?v=${video.id}`
  }));
  
  console.log(`⭐ Found ${videos.length} videos via myRating approach`);
  
  return {
    videos: videos,
    nextPageToken: data.nextPageToken || null,
    totalResults: data.pageInfo?.totalResults || videos.length
  };
}

// Also add this function for fetchMoreLikedVideos if it's missing
async function fetchMoreLikedVideos(pageToken) {
  console.log('📺 Fetching more liked videos with pageToken:', pageToken);
  
  if (!pageToken) {
    return {
      success: false,
      error: 'No page token provided for pagination'
    };
  }
  
  try {
    const result = await fetchLikedVideos(pageToken);
    
    if (result.success) {
      const storage = await chrome.storage.local.get(['likedVideos', 'totalResults']);
      const currentVideos = storage.likedVideos || [];
      const allVideos = [...currentVideos, ...result.videos];
      
      await chrome.storage.local.set({
        likedVideos: allVideos,
        nextPageToken: result.nextPageToken,
        totalResults: result.totalResults
      });
      
      return {
        success: true,
        videos: result.videos,
        allVideos: allVideos,
        count: result.videos.length,
        totalCount: allVideos.length,
        nextPageToken: result.nextPageToken,
        totalResults: result.totalResults
      };
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Error fetching more videos:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function deleteVideoFromYouTube(videoId) {
  try {
    console.log('🗑️ Deleting video from YouTube:', videoId);
    
    const response = await makeAuthenticatedRequest(`${API_BASE}/videos/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `id=${videoId}&rating=none`
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('YouTube API delete error:', response.status, errorText);
       if (response.status === 403 && errorText.includes('videoRatingDisabled')) {
        return {
          success: false,
          error: 'RATINGS_DISABLED',
          message: 'The video owner has disabled ratings for this video.'
        };
      }
      throw new Error(`Failed to delete video from YouTube: ${response.status}`);
    }
    
    console.log('✅ Video successfully removed from YouTube liked list');
    
    return {
      success: true,
      message: 'Video removed from YouTube liked list'
    };
    
  } catch (error) {
    console.error('❌ Error deleting video from YouTube:', error);
    
    if (error.message === 'NEEDS_REAUTH') {
      return {
        success: false,
        error: 'Authentication expired. Please sign in again.',
        needsReauth: true
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// UPDATED: Enhanced fetch with 404 pagination fallback
async function fetchLikedVideos(pageToken = null) {
  try {
    console.log('📺 Starting liked videos fetch process...', pageToken ? `with pageToken: ${pageToken}` : 'initial fetch');
    
    let videos = [];
    let nextPageToken = null;
    let totalResults = 0;
    
    try {
      const likedPlaylistId = await getLikedPlaylistId();
      const result = await fetchVideosFromPlaylist(likedPlaylistId, pageToken);
      videos = result.videos;
      nextPageToken = result.nextPageToken;
      totalResults = result.totalResults;
      
    } catch (playlistError) {
      console.log('⚠️ Playlist approach failed:', playlistError.message);
      
      // Handle re-authentication needs
      if (playlistError.message === 'NEEDS_REAUTH') {
        return {
          success: false,
          error: 'Authentication expired. Please sign in again.',
          needsReauth: true
        };
      }
      
      // *** FIX: Add PLAYLIST_PAGINATION_FAILED to the fallback triggers ***
      // Try alternative approach for all known playlist issues
      if ([
        'CHANNEL_ACCESS_DENIED', 
        'NO_CHANNEL_FOUND', 
        'NO_RELATED_PLAYLISTS', 
        'NO_LIKED_PLAYLIST', 
        'PLAYLIST_ACCESS_DENIED',
        'PLAYLIST_PAGINATION_FAILED'  // *** NEW: Handle 404 pagination errors ***
      ].includes(playlistError.message)) {
        try {
          console.log('🔄 Trying myRating approach...');
          const result = await fetchLikedVideosViaRating(pageToken);
          videos = result.videos;
          nextPageToken = result.nextPageToken;
          totalResults = result.totalResults;
        } catch (ratingError) {
          if (ratingError.message === 'NEEDS_REAUTH') {
            return {
              success: false,
              error: 'Authentication expired. Please sign in again.',
              needsReauth: true
            };
          }
          
          console.error('❌ Rating approach also failed:', ratingError.message);
          return {
            success: false,
            error: `Unable to fetch liked videos. Primary error: ${playlistError.message}. Alternative method also failed: ${ratingError.message}. Please ensure your liked videos are public in your YouTube privacy settings and try re-authenticating.`
          };
        }
      } else {
        throw playlistError; // Re-throw other unexpected playlist errors
      }
    }
    
    console.log(`✅ Successfully fetched ${videos.length} liked videos`);
    
    if (videos.length === 0 && !pageToken) {
      return {
        success: true,
        videos: [],
        count: 0,
        nextPageToken: null,
        totalResults: 0,
        message: 'No liked videos found. This could be because your liked videos are private or you haven\'t liked any videos yet.'
      };
    }
    
    // Store videos if first fetch
    if (!pageToken) {
      await chrome.storage.local.set({ 
        likedVideos: videos,
        nextPageToken: nextPageToken,
        totalResults: totalResults,
        lastFetchTime: Date.now()
      });
    }
    
    return {
      success: true,
      videos: videos,
      count: videos.length,
      nextPageToken: nextPageToken,
      totalResults: totalResults
    };
    
  } catch (error) {
    console.error('❌ Error in fetchLikedVideos:', error);
    
    if (error.message === 'NEEDS_REAUTH') {
      return {
        success: false,
        error: 'Authentication expired. Please sign in again.',
        needsReauth: true
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function exportLikedVideos() {
  try {
    console.log('📤 Starting FULL export of ALL liked videos...');
    
    let allVideos = [];
    const seenVideoIds = new Set(); // Track video IDs to prevent duplicates
    let pageToken = null;
    let totalFetched = 0;
    let totalAvailable = 0;
    let useRatingMethod = false;
    
    console.log('🔄 Fetching ALL liked videos for export...');
    
    do {
      console.log(`📥 Fetching page ${pageToken ? `(${pageToken})` : '1'}...`);
      
      let result;
      
      if (useRatingMethod) {
        console.log('⭐ Using myRating method for continuation...');
        try {
          const ratingResult = await fetchLikedVideosViaRating(pageToken);
          result = {
            success: true,
            videos: ratingResult.videos,
            nextPageToken: ratingResult.nextPageToken,
            totalResults: ratingResult.totalResults
          };
        } catch (error) {
          console.error('❌ Rating method failed:', error);
          result = {
            success: false,
            error: error.message,
            needsReauth: error.message === 'NEEDS_REAUTH'
          };
        }
      } else {
        try {
          const likedPlaylistId = await getLikedPlaylistId();
          const playlistResult = await fetchVideosFromPlaylist(likedPlaylistId, pageToken);
          result = {
            success: true,
            videos: playlistResult.videos,
            nextPageToken: playlistResult.nextPageToken,
            totalResults: playlistResult.totalResults
          };
        } catch (playlistError) {
          if (playlistError.message === 'PLAYLIST_PAGINATION_FAILED' || 
              playlistError.message.includes('invalid page token') ||
              playlistError.message.includes('404')) {
            console.log('🔄 Switching to myRating method permanently...');
            useRatingMethod = true;
            
            try {
              const ratingResult = await fetchLikedVideosViaRating(null);
              result = {
                success: true,
                videos: ratingResult.videos,
                nextPageToken: ratingResult.nextPageToken,
                totalResults: ratingResult.totalResults
              };
            } catch (ratingError) {
              console.error('❌ Rating method also failed:', ratingError);
              result = {
                success: false,
                error: ratingError.message,
                needsReauth: ratingError.message === 'NEEDS_REAUTH'
              };
            }
          } else if (playlistError.message === 'NEEDS_REAUTH') {
            result = {
              success: false,
              error: 'Authentication expired. Please sign in again.',
              needsReauth: true
            };
          } else {
            throw playlistError;
          }
        }
      }
      
      if (!result.success) {
        if (result.needsReauth) {
          throw new Error('Authentication expired. Please sign in again.');
        }
        throw new Error(result.error);
      }
      
      // *** NEW: Deduplicate videos ***
      const uniqueVideos = result.videos.filter(video => {
        if (seenVideoIds.has(video.id)) {
          console.log(`⚠️ Skipping duplicate video: ${video.id}`);
          return false;
        }
        seenVideoIds.add(video.id);
        return true;
      });
      
      allVideos = [...allVideos, ...uniqueVideos];
      pageToken = result.nextPageToken;
      totalFetched = allVideos.length; // Use actual unique count
      totalAvailable = result.totalResults || totalFetched;
      
      console.log(`📊 Progress: ${totalFetched} unique videos fetched (${result.videos.length - uniqueVideos.length} duplicates skipped this batch)`);
      
      // *** REMOVED: Safety limit of 1000 videos ***
      
    } while (pageToken);
    
    console.log(`✅ Finished fetching! Total unique videos: ${allVideos.length}`);
    
    if (allVideos.length === 0) {
      return {
        success: false,
        error: 'No liked videos found to export.'
      };
    }
    
    const storage = await chrome.storage.local.get(['userInfo']);
    
    const exportData = {
      exportDate: new Date().toISOString(),
      exportType: 'FULL_LIKED_VIDEOS_EXPORT',
      userInfo: {
        email: storage.userInfo?.email || 'Unknown',
        name: storage.userInfo?.name || 'Unknown'
      },
      statistics: {
        totalVideos: allVideos.length,
        totalAvailableOnYouTube: totalAvailable,
        exportCompleteness: '100%' // Since we fetch everything now
      },
      note: 'Complete export of YouTube liked videos with accurate timestamps and metadata (deduplicated)',
      videos: allVideos.map((video, index) => ({
        ...video,
        exportIndex: index + 1,
        exportedAt: new Date().toISOString()
      }))
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: `youtube-liked-videos-FULL-${new Date().toISOString().split('T')[0]}.json`,
      saveAs: true
    });
    
    console.log('✅ FULL export file created successfully');
    
    return {
      success: true,
      count: allVideos.length,
      totalAvailable: totalAvailable,
      completeness: '100%',
      message: `FULL export successful! ${allVideos.length} unique liked videos exported.`
    };
    
  } catch (error) {
    console.error('❌ Full export error:', error);
    
    if (error.message === 'NEEDS_REAUTH' || error.message.includes('Authentication expired')) {
      return {
        success: false,
        error: 'Authentication expired. Please sign in again.',
        needsReauth: true
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}
// NEW: Check authentication status on startup
async function checkAuthOnStartup() {
  try {
    console.log('🔍 Checking authentication status on startup...');
    
    const storage = await chrome.storage.local.get(['userToken', 'userInfo', 'lastAuthTime', 'userFullName']);
    
    if (!storage.userToken || !storage.userInfo) {
      console.log('❌ No stored authentication found');
      return;
    }
    
    const tokenCheck = await validateAndRefreshToken();
    
    if (tokenCheck.valid) {
      console.log('✅ Authentication is valid on startup');
    } else {
      console.log('❌ Authentication is invalid, user will need to re-authenticate');
      // Clear invalid data
      await chrome.storage.local.remove(['userToken', 'userInfo', 'userId', 'tokenExpiry', 'userFullName']);
    }
    
  } catch (error) {
    console.error('❌ Error checking auth on startup:', error);
  }
}

// NEW: Periodic token validation
setInterval(async () => {
  try {
    const storage = await chrome.storage.local.get(['userToken']);
    if (storage.userToken) {
      console.log('🔄 Periodic token validation...');
      await validateAndRefreshToken();
    }
  } catch (error) {
    console.error('❌ Periodic token validation error:', error);
  }
}, 15 * 60 * 1000); // Check every 15 minutes

// Message handling with enhanced error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received message:', message);
  
  switch (message.action) {
    case 'authenticate':
      authenticateWithYouTube().then(sendResponse);
      return true;
      
    case 'fetchLikedVideos':
      fetchLikedVideos().then(sendResponse);
      return true;
      
    case 'fetchMoreVideos':
      fetchMoreLikedVideos(message.pageToken).then(sendResponse);
      return true;
      
    case 'deleteVideo':
      deleteVideoFromYouTube(message.videoId).then(sendResponse);
      return true;
      
    case 'exportData':
      exportLikedVideos().then(sendResponse);
      return true;
      
    case 'checkAuth':
      validateAndRefreshToken().then(async (result) => {
        if (result.valid) {
          // --- START FIX 8: Send back results from `validateAndRefreshToken` directly ---
          sendResponse({ 
            success: true,
            userInfo: result.userInfo,       // Use userInfo from result
            userId: result.userId,           // Use userId from result
            userFullName: result.userFullName // Use userFullName from result
          });
          // --- END FIX 8 ---
        } else {
          // --- START FIX 9: Robust needsReauth check ---
          sendResponse({ 
            success: false,
            needsReauth: result.reason === 'EXPIRED_TOKEN' || result.needsAuth, // Combine needsAuth from results
            reason: result.reason 
          });
          // --- END FIX 9 ---
        }
      });
      return true;
      
    default:
      console.log('❓ Unknown action:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Enhanced startup handling
chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension startup');
  checkAuthOnStartup();
});

// Check auth when service worker becomes active
checkAuthOnStartup();

console.log('✅ Enhanced background script fully initialized with token refresh capabilities');


// *** FIX: Corrected webNavigation listener ***
chrome.webNavigation.onCompleted.addListener((details) => {
  // Ensure it's the main frame (frameId 0) and a YouTube watch page.
  // This event fires *after* the page is fully loaded, including redirects.
  if (details.frameId === 0 && details.url.includes("www.youtube.com/watch")) { 
    console.log(`WebNavigation completed for YouTube watch page: ${details.url}. Attempting to inject content script.`);
    
    // Use chrome.scripting.executeScript to inject content.js into the tab
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        // Log any errors if the injection fails
        console.error('Error injecting content script via webNavigation:', chrome.runtime.lastError.message);
      } else {
        console.log('Content script injected via webNavigation.onCompleted.');
      }
    });
  }
// Specify URL filters for which this listener should fire.
// This makes it more efficient by only listening for relevant navigations.
}, { url: [{ hostContains: 'www.youtube.com', pathPrefix: '/watch' }] });