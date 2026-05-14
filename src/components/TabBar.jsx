import { T } from '../tokens.js';
import Icon from './Icon.jsx';

export default function TabBar({ active, onChange, t }) {
  const tabs = [
    { id: 'home',   icon: 'home',  label: t ? t('home') : 'Home' },
    { id: 'diary',  icon: 'cal',   label: t ? t('diary') : 'Diary' },
    { id: 'new',    icon: 'plus',  label: '' },
    { id: 'guests', icon: 'users', label: t ? t('guests') : 'Guests' },
    { id: 'more',   icon: 'cog',   label: t ? t('more') : 'More' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderTop: `1px solid ${T.borderSoft}`,
      paddingBottom: 24, paddingTop: 8,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      zIndex: 30,
    }}>
      {tabs.map(tab => {
        const isFab = tab.id === 'new';
        const isActive = active === tab.id;
        if (isFab) {
          return (
            <button key={tab.id} onClick={() => onChange(tab.id)} style={{
              width: 52, height: 52, borderRadius: '50%',
              background: T.primary, color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(196, 95, 50, .35)', cursor: 'pointer',
              marginTop: -16,
            }}>
              <Icon name="plus" size={24} stroke={2.5} />
            </button>
          );
        }
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            color: isActive ? T.primary : T.ink3, padding: '4px 12px',
          }}>
            <Icon name={tab.icon} size={22} stroke={isActive ? 2 : 1.6} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.1 }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
