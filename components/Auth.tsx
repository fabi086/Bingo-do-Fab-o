import React, { useState } from 'react';
import type { User } from '../types';
import { gameStateService } from '../services/gameState';
import InfoCard from './InfoCard';

interface AuthProps {
  onLoginSuccess: (user: User) => void;
  allUsers: User[];
}

const Auth: React.FC<AuthProps> = ({ onLoginSuccess, allUsers }) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const user = allUsers.find(u => u.name === name && u.password === password);
    if (user) {
      onLoginSuccess(user);
    } else {
      setError('Nome de usuário ou senha inválidos.');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !password.trim() || !pixKey.trim()) {
      setError('Todos os campos são obrigatórios.');
      return;
    }
    
    const newUser: User = { name, password, pixKey };
    
    if (gameStateService.registerUser(newUser)) {
        onLoginSuccess(newUser);
    } else {
        setError('Este nome de usuário já existe.');
    }
  };

  return (
    <div className="min-h-screen bg-indigo-900 text-white p-4 flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(86,_30,_203,_0.4),_transparent_30%),_radial-gradient(circle_at_bottom_right,_rgba(251,_191,_36,_0.3),_transparent_40%)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
            <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">Bingo do Fabão</h1>
            <p className="text-xl text-gray-300 mt-2">Bingo Beneficente</p>
        </div>
        <InfoCard icon={isLoginView ? '🔑' : '👤'} title={isLoginView ? 'Login' : 'Cadastro'}>
          <form onSubmit={isLoginView ? handleLogin : handleRegister} className="space-y-4">
            <div>
              <label className="block mb-1 font-semibold">Nome:</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold">Senha:</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                required
              />
            </div>
            {!isLoginView && (
              <div>
                <label className="block mb-1 font-semibold">Sua Chave PIX:</label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={e => setPixKey(e.target.value)}
                  placeholder="Para futuros prêmios!"
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                  required
                />
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-3 rounded-lg text-lg transition-all"
            >
              {isLoginView ? 'Entrar' : 'Cadastrar e Entrar'}
            </button>
          </form>
          <button
            onClick={() => {
              setIsLoginView(!isLoginView);
              setError('');
            }}
            className="w-full mt-4 text-yellow-300 hover:underline"
          >
            {isLoginView ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça o login'}
          </button>
        </InfoCard>
      </div>
    </div>
  );
};

export default Auth;