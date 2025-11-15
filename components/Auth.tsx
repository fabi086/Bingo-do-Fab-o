import React, { useState } from 'react';
import type { User } from '../types';
import InfoCard from './InfoCard';

interface AuthProps {
  onLoginSuccess: (user: User) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

const Auth: React.FC<AuthProps> = ({ onLoginSuccess, users, setUsers }) => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const user = users.find(u => u.name === name && u.password === password);
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
    if (users.some(u => u.name === name)) {
      setError('Este nome de usuário já existe.');
      return;
    }

    const newUser: User = { name, password, pixKey };
    setUsers(prev => [...prev, newUser]);
    onLoginSuccess(newUser);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(31,_41,_55,_1),_transparent_30%),_radial-gradient(circle_at_bottom_right,_rgba(59,_130,_246,_0.3),_transparent_40%)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
            <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500">Bingo do Fabão</h1>
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
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block mb-1 font-semibold">Senha:</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
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
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                  required
                />
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold py-3 rounded-lg text-lg transition-all"
            >
              {isLoginView ? 'Entrar' : 'Cadastrar e Entrar'}
            </button>
          </form>
          <button
            onClick={() => {
              setIsLoginView(!isLoginView);
              setError('');
            }}
            className="w-full mt-4 text-cyan-300 hover:underline"
          >
            {isLoginView ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça o login'}
          </button>
        </InfoCard>
      </div>
    </div>
  );
};

export default Auth;