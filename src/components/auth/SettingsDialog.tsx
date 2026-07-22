import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
} from '@/lib/supabase'
import {
  getCloudinaryConfig,
  saveCloudinaryConfig,
  clearCloudinaryConfig,
} from '@/lib/config'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [cloudName, setCloudName] = useState('')
  const [uploadPreset, setUploadPreset] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      const sc = getSupabaseConfig()
      if (sc) {
        setSupabaseUrl(sc.url)
        setSupabaseAnonKey(sc.anonKey)
      }
      const cc = getCloudinaryConfig()
      setCloudName(cc.cloudName)
      setUploadPreset(cc.uploadPreset)
      setSaved(false)
    }
  }, [open])

  const handleSave = () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) return
    saveSupabaseConfig(supabaseUrl.trim(), supabaseAnonKey.trim())
    saveCloudinaryConfig({
      cloudName: cloudName.trim(),
      uploadPreset: uploadPreset.trim(),
    })
    setSaved(true)
    setTimeout(() => onOpenChange(false), 800)
  }

  const handleClear = () => {
    clearSupabaseConfig()
    clearCloudinaryConfig()
    setSupabaseUrl('')
    setSupabaseAnonKey('')
    setCloudName('')
    setUploadPreset('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            设置
          </DialogTitle>
          <DialogDescription>
            配置后端服务和图片上传。所有信息保存在本地浏览器中。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* Supabase */}
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-2 text-sm font-semibold">Supabase</legend>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="supabase-url">Project URL</Label>
                <Input
                  id="supabase-url"
                  placeholder="https://xxxxx.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="supabase-anon-key">Anon Key</Label>
                <Input
                  id="supabase-anon-key"
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Supabase Dashboard → Settings → API，使用 <strong>anon/public</strong> 密钥（非 service_role）
                </p>
              </div>
            </div>
          </fieldset>

          {/* Cloudinary */}
          <fieldset className="rounded-lg border border-border p-4">
            <legend className="px-2 text-sm font-semibold">Cloudinary（图片上传）</legend>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cloud-name">Cloud Name</Label>
                <Input
                  id="cloud-name"
                  placeholder="your-cloud-name"
                  value={cloudName}
                  onChange={(e) => setCloudName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="upload-preset">Upload Preset</Label>
                <Input
                  id="upload-preset"
                  placeholder="ml_default"
                  value={uploadPreset}
                  onChange={(e) => setUploadPreset(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                在 Cloudinary Dashboard → Settings → Upload 中创建 unsigned upload preset
              </p>
            </div>
          </fieldset>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleClear} type="button">
            清除全部配置
          </Button>
          <div className="flex gap-2">
            {saved && (
              <span className="flex items-center text-sm text-green-600"> 已保存</span>
            )}
            <Button onClick={handleSave} disabled={!supabaseUrl.trim() || !supabaseAnonKey.trim()}>
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
