import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './components/AuthLayout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import PostList from './pages/PostList';
import PostDetail from './pages/PostDetail';
import PostForm from './pages/PostForm';
import { useAuth } from './contexts/AuthContext';

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        {/* Default: redirect to posts list */}
        <Route path="/" element={<Navigate to="/posts" replace />} />

        {/* Post routes (public + authenticated) */}
        <Route path="/posts" element={<PostList />} />
        <Route path="/posts/:id" element={<PostDetail />} />
        <Route path="/posts/new" element={isAuthenticated ? <PostForm /> : <Navigate to="/login" replace />} />
        <Route path="/posts/:id/edit" element={isAuthenticated ? <PostForm /> : <Navigate to="/login" replace />} />

        {/* Dashboard */}
        <Route path="/dashboard" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />} />

        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/posts" replace />} />
          <Route path="/signup" element={!isAuthenticated ? <SignUp /> : <Navigate to="/posts" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
