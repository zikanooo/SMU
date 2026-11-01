import React from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accountSheet } from '../services/accountSheet';
import { Avatar } from './Avatar';

/** Tombol akun 👤: cincin gradien beranimasi saat belum masuk, foto profil saat sudah masuk. */
export const AccountButton: React.FC<{ size?: number }> = ({ size = 44 }) => {
  const { user } = useAuth();
  const inner = size - 6;
  return (
    <button onClick={accountSheet.open} className="account-btn" data-out={user ? undefined : ''}
      style={{ width: size, height: size }} aria-label={user ? `Akun ${user.name}` : 'Masuk atau daftar'} title={user ? user.name : 'Masuk'}>
      <span className="account-btn-in" style={{ width: inner, height: inner }}>
        {user ? <Avatar src={user.photo} name={user.name} size={inner} /> : <User size={Math.round(size * 0.46)} strokeWidth={2.2} />}
      </span>
    </button>
  );
};
