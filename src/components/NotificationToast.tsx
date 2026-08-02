'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Package, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Notification = {
  id: string;
  type: 'success' | 'info' | 'warning' | 'new-order';
  title: string;
  message: string;
};

declare global {
  interface Window {
    addNotification?: (notif: Notification) => void;
  }
}

export default function NotificationToast() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    window.addNotification = (notif: Notification) => {
      setNotifications(prev => [...prev, notif]);
      
      // Jouer un son de notification
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2jdXvz3kpBSh+zPDajzsKElyx6OyrWBUIQ5zd8sFuJAUuhM/z24k2CBhku+zooVARC0yl4fG5ZRwFNo3V7895KQUofsz');
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {}

      // Auto-suppression après 6 secondes
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notif.id));
      }, 6000);
    };

    return () => {
      delete window.addNotification;
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-3 max-w-sm">
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className={`rounded-xl shadow-2xl border backdrop-blur-xl overflow-hidden ${
              notif.type === 'new-order' 
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 border-amber-400 text-white' 
                : notif.type === 'success'
                ? 'bg-white border-green-200'
                : notif.type === 'warning'
                ? 'bg-white border-amber-200'
                : 'bg-white border-blue-200'
            }`}
          >
            <div className="p-4 flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${
                notif.type === 'new-order' ? 'bg-white/20' :
                notif.type === 'success' ? 'bg-green-100' :
                notif.type === 'warning' ? 'bg-amber-100' : 'bg-blue-100'
              }`}>
                {notif.type === 'new-order' ? (
                  <Package className="w-5 h-5 text-white" />
                ) : notif.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <Bell className={`w-5 h-5 ${
                    notif.type === 'warning' ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${
                  notif.type === 'new-order' ? 'text-white' : 'text-gray-900'
                }`}>
                  {notif.title}
                </p>
                <p className={`text-xs mt-0.5 ${
                  notif.type === 'new-order' ? 'text-white/90' : 'text-gray-600'
                }`}>
                  {notif.message}
                </p>
              </div>
              <button
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                className={`p-1 rounded-lg transition ${
                  notif.type === 'new-order' ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100 text-gray-400'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {notif.type === 'new-order' && (
              <div className="px-4 pb-3">
                <button 
                  onClick={() => {
                    window.location.href = '/dashboard/orders';
                  }}
                  className="w-full py-2 bg-white text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-50 transition"
                >
                  Voir la commande →
                </button>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}