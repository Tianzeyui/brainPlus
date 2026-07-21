import { useState } from 'react'
import TextType from '@/components/ui/TextType'

interface WelcomeHeroProps {
  /** 外层容器扩展样式 */
  className?: string
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 9) return '早上好'
  if (hour >= 9 && hour < 12) return '上午好'
  if (hour >= 12 && hour < 18) return '下午好'
  return '晚上好'
}

export default function WelcomeHero({ className = '' }: WelcomeHeroProps) {
  const [showSecondLine, setShowSecondLine] = useState(false)
  const [hideCursor, setHideCursor] = useState(false)

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="h-14 flex items-center">
        <TextType
          text={[getGreeting()]}
          typingSpeed={80}
          loop={false}
          showCursor={false}
          onSentenceComplete={() => setShowSecondLine(true)}
          className="text-4xl font-bold tracking-tight text-foreground/90"
        />
      </div>
      <div className="h-7 flex items-center">
        {showSecondLine && (
          <TextType
            text={['有什么可以帮你的？']}
            typingSpeed={80}
            loop={false}
            showCursor={!hideCursor}
            cursorCharacter="|"
            onSentenceComplete={() => setHideCursor(true)}
            className="text-xl text-muted-foreground/70"
          />
        )}
      </div>
    </div>
  )
}
