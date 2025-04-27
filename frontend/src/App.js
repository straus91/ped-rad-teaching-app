// App.js (Updated)
// Import React hooks
import React, { useState, useEffect, useCallback, useRef } from 'react';

// Keep the existing imports for Cornerstone libraries
// They're now handled in the DicomViewer component directly

// Import New Components
import DicomViewer from './components/DicomViewer';
import ReportingWorkstation from './components/ReportingWorkstation';
import FeedbackPage from './components/FeedbackPage';

// --- Constants ---
const API_BASE_URL = 'http://127.0.0.1:8000/api';

// --- Helper Function for API Calls ---
async function apiCall(endpoint, method = 'GET', data = null, token = null) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', };
  if (token) { headers['Authorization'] = `Token ${token}`; }
  
  const config = { method: method, headers: headers };
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      let errorData;
      try { errorData = await response.json(); }
      catch (e) { errorData = { detail: `HTTP error! status: ${response.status}` }; }
      const error = new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      error.status = response.status; error.data = errorData; throw error;
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) { console.error(`API call failed for ${method} ${endpoint}:`, error); throw error; }
}

// --- Authentication Component ---
function LoginRegister({ setAuthToken, navigate }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password1Value, setPassword1Value] = useState('');
  const [email, setEmail] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const clearForm = () => { setUsername(''); setPassword1Value(''); setEmail(''); setPassword2(''); setError(null); };
  const handleToggleMode = () => { setIsLogin(!isLogin); clearForm(); };

  const handleSubmit = async (event) => {
    event.preventDefault(); setLoading(true); setError(null);
    const endpoint = isLogin ? '/auth/login/' : '/auth/registration/';
    const payload = isLogin ? { username, password: password1Value } : { username, email, password1: password1Value, password2 };
    try {
      const data = await apiCall(endpoint, 'POST', payload);
      if ((isLogin || !isLogin) && data.key) {
        console.log(`${isLogin ? 'Login' : 'Registration'} successful, token:`, data.key);
        setAuthToken(data.key); localStorage.setItem('authToken', data.key); navigate('dashboard');
      } else if (!isLogin) {
        console.log("Registration successful! Please log in.");
        setIsLogin(true); clearForm(); setError("Registration successful! Please log in.");
      }
    } catch (err) {
      console.error(`${isLogin ? 'Login' : 'Registration'} failed:`, err);
      let errorMessage = `An error occurred.`;
      if (err.data) { errorMessage = Object.entries(err.data).map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(' ') : messages}`).join('; '); }
      else if (err.message) { errorMessage = err.message; }
      setError(errorMessage);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-200 via-blue-200 to-purple-200 font-sans">
      <div className="w-full max-w-md p-10 space-y-6 bg-white rounded-xl shadow-2xl">
        <h2 className="text-3xl font-bold text-center text-gray-900">{isLogin ? 'Welcome Back!' : 'Create Account'}</h2>
        {error && <div className="p-3 text-sm text-red-800 bg-red-100 border border-red-300 rounded-lg" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label><input id="username" name="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="block w-full px-4 py-2.5 mt-1 text-gray-900 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-600 focus:border-indigo-600 sm:text-sm transition duration-150 ease-in-out"/></div>
          {!isLogin && ( <div><label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label><input id="email" name="email" type="email" required={!isLogin} value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full px-4 py-2.5 mt-1 text-gray-900 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-600 focus:border-indigo-600 sm:text-sm transition duration-150 ease-in-out"/></div> )}
          <div><label htmlFor="password1" className="block text-sm font-medium text-gray-700 mb-1">Password</label><input id="password1" name="password1" type="password" required value={password1Value} onChange={(e) => setPassword1Value(e.target.value)} className="block w-full px-4 py-2.5 mt-1 text-gray-900 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-600 focus:border-indigo-600 sm:text-sm transition duration-150 ease-in-out"/></div>
          {!isLogin && ( <div><label htmlFor="password2" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label><input id="password2" name="password2" type="password" required={!isLogin} value={password2} onChange={(e) => setPassword2(e.target.value)} className="block w-full px-4 py-2.5 mt-1 text-gray-900 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-600 focus:border-indigo-600 sm:text-sm transition duration-150 ease-in-out"/></div> )}
          <div><button type="submit" disabled={loading} className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-base font-semibold text-white transition duration-150 ease-in-out ${ loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'}`}>{loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}</button></div>
        </form>
        <div className="text-sm text-center pt-2"><button onClick={handleToggleMode} className="font-medium text-indigo-600 hover:text-indigo-500 hover:underline">{isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}</button></div>
      </div>
    </div>
  );
}

// --- Dashboard Component ---
function Dashboard({ authToken, setAuthToken, navigate }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authToken) {
      setLoading(true); setError(null);
      apiCall('/cases/', 'GET', null, authToken)
        .then(data => {
          if (Array.isArray(data)) { setCases(data); }
          else { console.error("API did not return an array for cases:", data); setCases([]); setError("Received invalid data format."); }
          setLoading(false);
        })
        .catch(err => { console.error("Failed to fetch cases:", err); setError(err.message || "Failed to load cases."); setLoading(false); });
    } else { navigate('login'); setLoading(false); }
  }, [authToken, navigate]);

  const handleLogout = async () => {
    try { await apiCall('/auth/logout/', 'POST', null, authToken); }
    catch (error) { console.error("Logout API call failed:", error); }
    finally { setAuthToken(null); localStorage.removeItem('authToken'); navigate('login'); }
  };

  const handleOpenCase = (caseId) => { navigate('workstation', { caseId: caseId }); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-100 font-sans">
      <header className="bg-white shadow-sm sticky top-0 z-10 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center"><svg className="h-8 w-8 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg><h1 className="text-xl md:text-2xl font-semibold text-gray-800">PedRad Teaching Room</h1></div>
            <button onClick={handleLogout} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition duration-150 ease-in-out">Logout</button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Available Cases</h2>
          {loading && <p className="text-center text-gray-600 py-10 text-lg">Loading cases...</p>}
          {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md shadow" role="alert"><p className="font-bold">Error</p><p>{error}</p></div>}
          {!loading && !error && ( <> {cases.length === 0 ? ( <div className="text-center text-gray-500 py-10 bg-white rounded-lg shadow">No cases available yet. Add some via the Django Admin!</div> ) : ( <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"> {cases.map(caseItem => ( <div key={caseItem.id} className="bg-white rounded-lg shadow-md overflow-hidden transition duration-300 ease-in-out hover:shadow-xl flex flex-col border border-gray-200"> <div className="p-6 flex-grow"><h3 className="text-xl font-semibold text-indigo-700 mb-3">{caseItem.title}</h3><div className="flex flex-wrap gap-x-3 gap-y-2 text-xs mb-4"><span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">{caseItem.modality_display || caseItem.modality}</span><span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium">{caseItem.subspecialty_display || caseItem.subspecialty}</span><span className={`inline-flex items-center px-3 py-1 rounded-full font-medium ${ caseItem.difficulty === 'easy' ? 'bg-yellow-100 text-yellow-800' : caseItem.difficulty === 'medium' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800' }`}>{caseItem.difficulty_display || caseItem.difficulty}</span></div><p className="text-gray-600 text-sm mb-4 line-clamp-3">{caseItem.description}</p></div><div className="bg-gray-50 px-6 py-4 border-t border-gray-200"><button onClick={() => handleOpenCase(caseItem.id)} className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out">Open Case</button></div></div> ))} </div> )} </> )}
        </div>
      </main>
    </div>
  );
}

// --- Main App Component ---
function App() {
  const [route, setRoute] = useState({ page: 'login', params: {} });
  const [authToken, setAuthToken] = useState(localStorage.getItem('authToken'));

  const navigate = useCallback((page, params = {}) => {
    console.log(`Navigating to ${page} with params:`, params);
    setRoute({ page, params });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      setRoute(currentRoute => currentRoute.page === 'login' ? { page: 'dashboard', params: {} } : currentRoute);
    } else {
      setRoute({ page: 'login', params: {} });
    }
  }, []);

  const renderPage = () => {
    const { page, params } = route;

    if (authToken) {
        switch (page) {
            case 'dashboard':
                return <Dashboard authToken={authToken} setAuthToken={setAuthToken} navigate={navigate} />;
            case 'workstation':
                return <ReportingWorkstation authToken={authToken} navigate={navigate} params={params} />;
            case 'feedback':
                return <FeedbackPage authToken={authToken} navigate={navigate} params={params} />;
            default:
                return <Dashboard authToken={authToken} setAuthToken={setAuthToken} navigate={navigate} />;
        }
    } else {
        switch (page) {
            case 'login':
            case 'register':
                return <LoginRegister setAuthToken={setAuthToken} navigate={navigate} />;
            default:
                return <LoginRegister setAuthToken={setAuthToken} navigate={navigate} />;
        }
    }
  };

  return (
    <div>
      {/* Tailwind script assumed in public/index.html */}
      {renderPage()}
    </div>
  );
}

export default App;