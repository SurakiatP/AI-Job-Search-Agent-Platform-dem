import { Bot, Languages, LogOut, Mic, Monitor, Moon, Settings, Sun, Trash2, UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLocale } from '../app/providers';
import { useTheme, type Theme } from '../app/theme';
import { logout, useAccount } from '../lib/api';
import { useTrashCount } from '../lib/useTrashCount';
import { Avatar } from './Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

const themes = [['light', Sun], ['dark', Moon], ['system', Monitor]] as const;

// One avatar button holds everything that is not a daily destination: account, tools, trash, theme, language.
export function AccountMenu({ projectId, wide = false }: { projectId?: string; wide?: boolean }) {
  const { t } = useTranslation();
  const account = useAccount();
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const trash = useTrashCount(projectId);
  const base = projectId ? `/app/projects/${projectId}` : null;
  const nextTheme = themes[(themes.findIndex(([value]) => value === theme) + 1) % themes.length][0] as Theme;
  const ThemeIcon = themes.find(([value]) => value === theme)![1];
  const link = (to: string, Icon: typeof Bot, label: string, count?: number) => <DropdownMenuItem asChild><Link to={to}><Icon aria-hidden="true" />{label}{count ? <span className="ms-auto text-xs tabular-nums text-muted-foreground">{count}</span> : null}</Link></DropdownMenuItem>;
  return <DropdownMenu>
    <DropdownMenuTrigger className={`flex min-h-11 min-w-0 items-center gap-2 rounded-lg text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-10 ${wide ? 'w-full px-2 hover:bg-primary/[0.04]' : 'rounded-full'}`} aria-label={`${t('account.menu')}${account ? `: ${account.email}` : ''}`}>
      {account ? <Avatar account={account} size={wide ? 28 : 40} /> : <UserCog size={20} aria-hidden="true" />}
      {wide && <span className="min-w-0 flex-1 truncate">{account?.email ?? t('account.menu')}</span>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align={wide ? 'start' : 'end'} side={wide ? 'top' : 'bottom'} className="min-w-56">
      {link('/app/account', UserCog, t('account.menu'))}
      {link(projectId ? `/app/settings?project=${encodeURIComponent(projectId)}` : '/app/settings', Settings, t('settings'))}
      {base && <>
        <div role="separator" className="my-1 h-px bg-border" />
        {link(`${base}/practice`, Mic, t('nav.practice'))}
        {link(`${base}/console`, Bot, t('nav.console'))}
        {link(`${base}/trash`, Trash2, t('nav.trash'), trash)}
      </>}
      <div role="separator" className="my-1 h-px bg-border" />
      <DropdownMenuItem onSelect={event => { event.preventDefault(); setTheme(nextTheme); }}><ThemeIcon aria-hidden="true" />{t('appearance')}<span className="ms-auto text-xs text-muted-foreground">{t(theme)}</span></DropdownMenuItem>
      <DropdownMenuItem onSelect={event => { event.preventDefault(); setLocale(locale === 'th' ? 'en' : 'th'); }}><Languages aria-hidden="true" />{t('language')}<span className="ms-auto text-xs text-muted-foreground">{locale === 'th' ? 'ไทย' : 'EN'}</span></DropdownMenuItem>
      <div role="separator" className="my-1 h-px bg-border" />
      <DropdownMenuItem onSelect={() => void logout()}><LogOut aria-hidden="true" />{t('auth.logout')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
