// Save this file as frontend/src/utils/debugApiCall.js

/**
 * Enhanced API call function with detailed error logging
 */
export const debugApiCall = async (endpoint, method = 'GET', data = null, token = null) => {
    const API_BASE_URL = 'http://127.0.0.1:8000/api';
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) { headers['Authorization'] = `Token ${token}`; }
    
    const config = { method: method, headers: headers };
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }
    
    console.group(`API Call: ${method} ${endpoint}`);
    console.log('Request Headers:', headers);
    if (data) console.log('Request Data:', data);
    
    try {
      const response = await fetch(url, config);
      
      // Always try to get the response body for debugging, regardless of status
      let responseBody;
      try {
        responseBody = await response.clone().json();
        console.log('Response Status:', response.status);
        console.log('Response Body:', responseBody);
      } catch (e) {
        console.log('Response Status:', response.status);
        console.log('Response Body: Could not parse JSON');
        try {
          responseBody = await response.clone().text();
          console.log('Response Text:', responseBody);
        } catch (e2) {
          console.log('Could not extract response text either');
        }
      }
      
      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        error.status = response.status;
        error.data = responseBody;
        console.error('API Request Failed:', error);
        console.groupEnd();
        throw error;
      }
      
      console.log('API Request Successful');
      console.groupEnd();
      
      if (response.status === 204) return null;
      return responseBody;
    } catch (error) {
      console.error('API Request Error:', error);
      console.groupEnd();
      throw error;
    }
  };