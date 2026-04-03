'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import { AppShell } from '@/layouts/AppShell';
import { api } from '@/utils/api';
import { getToken } from '@/utils/auth';
import type { UserPreferences } from '@/utils/types';

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [org, setOrg] = useState('Nagpur Community Clinic');
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState<UserPreferences>({
    showDisclaimerAlways: true,
    saveLocalHistory: true,
    enableDesktopNotifications: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/auth');
      return;
    }

    (async () => {
      try {
        const profile = await api.getProfile();
        setName(profile.name);
        setEmail(profile.email);
        setPrefs(profile.preferences);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to load profile settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const saveSettings = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await api.updateSettings({ name, preferences: prefs });
      setMessage('Settings updated successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Settings" subtitle="Profile and privacy-first workspace preferences.">
      {message ? <p className="mb-4 text-sm text-[var(--gd)]">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription className="mt-1">Used only for local workspace labeling and report headers.</CardDescription>
            </div>
          </CardHeader>

          <div className="space-y-3">
            <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} disabled={loading} />
            <Input
              label="Clinic / Organization"
              value={org}
              onChange={(event) => setOrg(event.target.value)}
              disabled={loading}
            />
            <Input label="Email" type="email" value={email} disabled />
            <Button className="mt-1" variant="primary" onClick={saveSettings} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Preferences</CardTitle>
              <CardDescription className="mt-1">
                Safety-first defaults are enabled out of the box and recommended.
              </CardDescription>
            </div>
          </CardHeader>

          <div className="space-y-3">
            <Toggle
              label="Always show clinical disclaimer"
              description="Display safety notice on every result screen and exported report."
              checked={prefs.showDisclaimerAlways}
              onChange={(next) => setPrefs((prev) => ({ ...prev, showDisclaimerAlways: next }))}
            />
            <Toggle
              label="Save local analysis history"
              description="Store structured result metadata on this device only."
              checked={prefs.saveLocalHistory}
              onChange={(next) => setPrefs((prev) => ({ ...prev, saveLocalHistory: next }))}
            />
            <Toggle
              label="Desktop notifications"
              description="Get notified when a long-running local analysis finishes."
              checked={prefs.enableDesktopNotifications}
              onChange={(next) => setPrefs((prev) => ({ ...prev, enableDesktopNotifications: next }))}
            />
            <Button variant="outline" onClick={saveSettings} disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save preferences'}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
