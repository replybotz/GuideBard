"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Key, Mic2, Globe, Lock, Eye, EyeOff, Check, X, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import api from "@/lib/api";

const PROVIDERS = [
  { id: "openai", name: "OpenAI", desc: "GPT-4o, GPT-4o-mini, o1-mini" },
  { id: "anthropic", name: "Anthropic", desc: "Claude Opus, Sonnet, Haiku" },
  { id: "gemini", name: "Google Gemini", desc: "Gemini 2.0 Flash, 1.5 Pro" },
  { id: "grok", name: "xAI Grok", desc: "Grok-3, Grok-3-mini" },
  { id: "perplexity", name: "Perplexity", desc: "Sonar Pro, Sonar" },
  { id: "openrouter", name: "OpenRouter", desc: "200+ models via one API" },
  { id: "elevenlabs", name: "ElevenLabs", desc: "Text-to-speech & voice cloning" },
  { id: "ollama", name: "Ollama (Local)", desc: "Local LLMs — no key needed" },
];

function ApiKeyRow({ provider, configured, hint }: { provider: typeof PROVIDERS[0]; configured: boolean; hint?: string }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/settings/api-keys/${provider.id}`, { api_key: key }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast({ title: `${provider.name} key saved` }); setKey(""); },
    onError: () => toast({ title: "Failed to save key", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/settings/api-keys/${provider.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast({ title: `${provider.name} key removed` }); },
  });

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await api.post("/ai/test-provider", { provider: provider.id });
      setTestResult(res.data.ok);
      toast({ title: res.data.ok ? "Connection successful" : "Connection failed", variant: res.data.ok ? "default" : "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-start gap-4 py-4 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{provider.name}</p>
          {configured ? <Badge variant="success">Connected</Badge> : <Badge variant="outline">Not set</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{provider.desc}</p>
        {configured && hint && <p className="text-xs text-muted-foreground mt-0.5">Key: {hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {configured && (
          <>
            <Button variant="ghost" size="sm" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : testResult === true ? <Check className="h-3.5 w-3.5 text-green-500" /> : testResult === false ? <X className="h-3.5 w-3.5 text-red-500" /> : "Test"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate()}>Remove</Button>
          </>
        )}
        {provider.id !== "ollama" && (
          <div className="flex gap-1.5">
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={configured ? "Replace key…" : "Paste API key…"}
                className="w-52 h-8 text-xs pr-8"
              />
              <button onClick={() => setShow(!show)} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!key || saveMutation.isPending} className="h-8">
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function VoiceProfilesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [voiceProvider, setVoiceProvider] = useState("elevenlabs");
  const [voiceId, setVoiceId] = useState("");
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloning, setCloning] = useState(false);

  const { data: profiles = [] } = useQuery({ queryKey: ["voice-profiles"], queryFn: () => api.get("/voice/profiles").then((r) => r.data) });
  const { data: el11Voices = [] } = useQuery({
    queryKey: ["el11-voices"],
    queryFn: () => api.get("/voice/elevenlabs/voices").then((r) => r.data).catch(() => []),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/voice/profiles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["voice-profiles"] }); toast({ title: "Profile deleted" }); },
  });

  const addProfile = async () => {
    if (!newName) return;
    await api.post("/voice/profiles", { name: newName, provider: voiceProvider, voice_id: voiceId });
    qc.invalidateQueries({ queryKey: ["voice-profiles"] });
    setNewName(""); setVoiceId("");
    toast({ title: "Voice profile added" });
  };

  const cloneVoice = async () => {
    if (!cloneFile || !newName) return;
    setCloning(true);
    try {
      const form = new FormData();
      form.append("name", newName);
      form.append("sample", cloneFile);
      await api.post("/voice/clone", form, { headers: { "Content-Type": "multipart/form-data" } });
      qc.invalidateQueries({ queryKey: ["voice-profiles"] });
      toast({ title: "Voice cloned successfully!" });
      setNewName(""); setCloneFile(null);
    } catch { toast({ title: "Clone failed", variant: "destructive" }); }
    finally { setCloning(false); }
  };

  return (
    <div className="space-y-6">
      {/* Existing profiles */}
      <Card>
        <CardHeader><CardTitle className="text-base">Voice Profiles</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {profiles.length === 0 && <p className="text-sm text-muted-foreground">No voice profiles yet.</p>}
          {profiles.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.provider} · {p.is_cloned ? "Cloned" : "Preset"} · ID: {p.voice_id || "—"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(p.id)}>Remove</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Add preset voice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Preset Voice</CardTitle>
          <CardDescription>Use an existing ElevenLabs or OpenAI voice ID</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Profile Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Voice" />
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <select value={voiceProvider} onChange={(e) => setVoiceProvider(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="elevenlabs">ElevenLabs</option>
                <option value="openai">OpenAI TTS</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Voice ID</Label>
            <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" />
          </div>
          <Button onClick={addProfile} disabled={!newName}>Add Profile</Button>
        </CardContent>
      </Card>

      {/* Voice clone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clone a Voice</CardTitle>
          <CardDescription>Upload a 30-second audio sample to clone via ElevenLabs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Clone Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Cloned Voice" />
          </div>
          <div className="space-y-1.5">
            <Label>Audio Sample (MP3/WAV, min 30 seconds)</Label>
            <div className="flex gap-2">
              <input type="file" accept="audio/*" id="voice-sample" className="hidden" onChange={(e) => setCloneFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="voice-sample" className="flex-1">
                <Button variant="outline" className="w-full gap-2" asChild>
                  <span><Upload className="h-4 w-4" />{cloneFile ? cloneFile.name : "Choose file"}</span>
                </Button>
              </label>
              <Button onClick={cloneVoice} disabled={!cloneFile || !newName || cloning} className="gap-2">
                {cloning && <Loader2 className="h-4 w-4 animate-spin" />}Clone
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PublishTargetsTab() {
  const qc = useQueryClient();
  const [wpUrl, setWpUrl] = useState("");
  const [wpUser, setWpUser] = useState("");
  const [wpPass, setWpPass] = useState("");
  const [wpName, setWpName] = useState("");
  const [ytClientId, setYtClientId] = useState("");
  const [ytClientSecret, setYtClientSecret] = useState("");
  const [ytChannelName, setYtChannelName] = useState("");
  const [ytConnecting, setYtConnecting] = useState(false);

  const { data: targets = [] } = useQuery({ queryKey: ["publish-targets"], queryFn: () => api.get("/publish/targets").then((r) => r.data) });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/publish/targets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["publish-targets"] }); toast({ title: "Target removed" }); },
  });

  const addWordPress = async () => {
    await api.post("/publish/targets", {
      platform: "wordpress",
      name: wpName || wpUrl,
      credentials: { username: wpUser, app_password: wpPass },
      settings: { site_url: wpUrl },
    });
    qc.invalidateQueries({ queryKey: ["publish-targets"] });
    setWpUrl(""); setWpUser(""); setWpPass(""); setWpName("");
    toast({ title: "WordPress site connected" });
  };

  const wptargets = targets.filter((t: any) => t.platform === "wordpress");
  const yttargets = targets.filter((t: any) => t.platform === "youtube");

  return (
    <div className="space-y-6">
      {/* Existing targets */}
      {targets.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Connected Destinations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {targets.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{t.platform}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(t.id)}>Remove</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add WordPress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect WordPress.org Site</CardTitle>
          <CardDescription>Uses Application Passwords — no plugin needed. Generate one in WordPress → Users → Profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Site Name</Label>
            <Input value={wpName} onChange={(e) => setWpName(e.target.value)} placeholder="My Blog" />
          </div>
          <div className="space-y-1.5">
            <Label>WordPress URL</Label>
            <Input value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://yourblog.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={wpUser} onChange={(e) => setWpUser(e.target.value)} placeholder="admin" />
            </div>
            <div className="space-y-1.5">
              <Label>Application Password</Label>
              <Input type="password" value={wpPass} onChange={(e) => setWpPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
            </div>
          </div>
          <Button onClick={addWordPress} disabled={!wpUrl || !wpUser || !wpPass}>Connect WordPress</Button>
        </CardContent>
      </Card>

      {/* Add YouTube via OAuth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect YouTube Channel</CardTitle>
          <CardDescription>
            Requires a Google Cloud project with YouTube Data API v3 enabled.{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Create OAuth credentials
            </a>{" "}
            (type: Web application, redirect URI:{" "}
            <code className="text-xs bg-muted px-1 rounded">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/publish/youtube/oauth/callback
            </code>
            )
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Channel Display Name</Label>
            <Input value={ytChannelName} onChange={(e) => setYtChannelName(e.target.value)} placeholder="My YouTube Channel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>OAuth Client ID</Label>
              <Input value={ytClientId} onChange={(e) => setYtClientId(e.target.value)} placeholder="xxxxxxx.apps.googleusercontent.com" />
            </div>
            <div className="space-y-1.5">
              <Label>OAuth Client Secret</Label>
              <Input type="password" value={ytClientSecret} onChange={(e) => setYtClientSecret(e.target.value)} placeholder="GOCSPX-…" />
            </div>
          </div>
          <Button
            disabled={!ytClientId || !ytClientSecret || ytConnecting}
            className="gap-2"
            onClick={async () => {
              setYtConnecting(true);
              try {
                const res = await api.post("/publish/youtube/oauth/start", {
                  client_id: ytClientId,
                  client_secret: ytClientSecret,
                  channel_name: ytChannelName || "My YouTube Channel",
                });
                const popup = window.open(res.data.auth_url, "youtube_oauth", "width=600,height=700");
                const handleMsg = (e: MessageEvent) => {
                  if (e.data?.type === "youtube_oauth_success") {
                    qc.invalidateQueries({ queryKey: ["publish-targets"] });
                    toast({ title: "YouTube channel connected!" });
                    setYtClientId(""); setYtClientSecret(""); setYtChannelName("");
                    window.removeEventListener("message", handleMsg);
                  }
                };
                window.addEventListener("message", handleMsg);
                // Fallback: poll for popup close
                const timer = setInterval(() => {
                  if (popup?.closed) {
                    clearInterval(timer);
                    window.removeEventListener("message", handleMsg);
                    qc.invalidateQueries({ queryKey: ["publish-targets"] });
                    setYtConnecting(false);
                  }
                }, 1000);
              } catch {
                toast({ title: "Failed to start OAuth", variant: "destructive" });
                setYtConnecting(false);
              }
            }}
          >
            {ytConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect via Google OAuth
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { data: apiKeys = [] } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get("/settings/api-keys").then((r) => r.data),
  });

  const keyMap = Object.fromEntries(apiKeys.map((k: any) => [k.provider, k]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure AI providers, voice profiles, and publishing destinations</p>
      </div>

      <Tabs defaultValue="ai">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ai" className="gap-2"><Key className="h-4 w-4" />AI Providers</TabsTrigger>
          <TabsTrigger value="voice" className="gap-2"><Mic2 className="h-4 w-4" />Voice</TabsTrigger>
          <TabsTrigger value="publish" className="gap-2"><Globe className="h-4 w-4" />Publishing</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Keys</CardTitle>
              <CardDescription>Keys are encrypted at rest and never exposed in full. You own them — they are used only for generation requests you initiate.</CardDescription>
            </CardHeader>
            <CardContent>
              {PROVIDERS.map((p) => (
                <ApiKeyRow key={p.id} provider={p} configured={!!keyMap[p.id]} hint={keyMap[p.id]?.key_hint} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice"><VoiceProfilesTab /></TabsContent>
        <TabsContent value="publish"><PublishTargetsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
