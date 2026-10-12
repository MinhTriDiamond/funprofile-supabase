import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export default function PetGameGuideDocs() {
  const { t } = useLanguage();
  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold mb-2">{t('petTitle')}</h1>
        <p className="text-muted-foreground">
          {t('petIntro')}
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>{t('petTocTitle')}</CardTitle></CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li><a className="hover:underline text-primary" href="#lumi-la-gi">{t('petToc1')}</a></li>
            <li><a className="hover:underline text-primary" href="#nuoi-lumi">{t('petToc2')}</a></li>
            <li><a className="hover:underline text-primary" href="#cheer">{t('petToc3')}</a></li>
            <li><a className="hover:underline text-primary" href="#mystery-box">Mystery Box</a></li>
            <li><a className="hover:underline text-primary" href="#shop">Shop CAMLY on-chain</a></li>
            <li><a className="hover:underline text-primary" href="#risk">Risk Engine & Anti-farm</a></li>
            <li><a className="hover:underline text-primary" href="#arena">Arena 1v1</a></li>
            <li><a className="hover:underline text-primary" href="#settings">{t('petToc8')}</a></li>
            <li><a className="hover:underline text-primary" href="#voice">Voice Lumi (Phase 8B)</a></li>
            <li><a className="hover:underline text-primary" href="#nguyen-tac">{t('petToc10')}</a></li>
            <li><a className="hover:underline text-primary" href="#faq">FAQ</a></li>
            <li><a className="hover:underline text-primary" href="#changelog">Changelog</a></li>
          </ol>
        </CardContent>
      </Card>

      <Card id="lumi-la-gi">
        <CardHeader><CardTitle>{t('petS1Title')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t('petS1Para1A')}<b>{t('petS1Para1B')}</b>{t('petS1Para1C')}
          </p>
          <p>
            {t('petS1Para2A')}<Link className="text-primary hover:underline" to="/pet">/pet</Link>{t('petS1Para2B')}<b>{t('petS1Para2C')}</b>{t('petS1Para2D')}
          </p>
        </CardContent>
      </Card>

      <Card id="nuoi-lumi">
        <CardHeader><CardTitle>{t('petS2Title')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t('petS2Intro')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Badge variant="secondary">Level</Badge>{t('petS2Level')}</li>
            <li><Badge variant="secondary">XP</Badge>{t('petS2Xp')}</li>
            <li><Badge variant="secondary">Mood</Badge>{t('petS2Mood')}</li>
          </ul>
          <p><b>Cap:</b>{t('petS2CapB')}<b>500 XP/user/UTC day</b>{t('petS2CapC')}</p>
        </CardContent>
      </Card>

      <Card id="cheer">
        <CardHeader><CardTitle>{t('petS3Title')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t('petS3Para1A')}<b>Friends</b>{t('petS3Para1B')}<code>/pet</code>{t('petS3Para1C')}
          </p>
          <p>
            {t('petS3Para2A')}<code>pet_risk_signals</code>{t('petS3Para2B')}<b>self-loop</b>{t('petS3Para2C')}
          </p>
        </CardContent>
      </Card>

      <Card id="mystery-box">
        <CardHeader><CardTitle>4. Mystery Box</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t('petS4Para1')}
          </p>
          <p>
            {t('petS4Para2A')}
            <Link to="/docs/mystery-box" className="text-primary hover:underline">
              /docs/mystery-box
            </Link>.
          </p>
        </CardContent>
      </Card>

      <Card id="shop">
        <CardHeader><CardTitle>5. Shop CAMLY on-chain (Phase 6)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t('petS5Para1A')}<Link className="text-primary hover:underline" to="/pet/shop">/pet/shop</Link>{t('petS5Para1B')}<code>price_camly</code>, <code>level_required</code>{t('petS5Para1D')}<code>stock</code>.
          </p>
          <p><b>{t('petS5MechTitle')}</b></p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>{t('petS5Step1A')}<Badge variant="outline">pending</Badge>.</li>
            <li>{t('petS5Step2A')}<code>funtreasury</code> (BSC).</li>
            <li>{t('petS5Step3A')}<code>pet-shop-confirm</code>{t('petS5Step3B')}</li>
          </ol>
          <p className="text-muted-foreground">
            {t('petS5Note')}
          </p>
        </CardContent>
      </Card>

      <Card id="risk">
        <CardHeader><CardTitle>6. Risk Engine & Anti-farm (Phase 7)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t('petS6Intro')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Badge>safe</Badge>{t('petS6Safe')}</li>
            <li><Badge variant="secondary">watch</Badge>{t('petS6Watch')}</li>
            <li><Badge variant="outline">restricted</Badge>{t('petS6Restricted')}</li>
            <li><Badge variant="destructive">frozen</Badge>{t('petS6Frozen')}</li>
          </ul>
          <p>
            {t('petS6Para2A')}
            <Link to="/pet/appeal" className="text-primary hover:underline">/pet/appeal</Link>.
          </p>
        </CardContent>
      </Card>

      <Card id="arena">
        <CardHeader><CardTitle>7. Arena 1v1 (Phase 8A)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t('petS7Para1A')}<Link to="/pet/arena" className="text-primary hover:underline">/pet/arena</Link>.
          </p>
          <p><b>{t('petS7StatsTitle')}</b></p>
          <ul className="list-disc pl-5 space-y-1">
            <li><Badge>ATK</Badge>{t('petS7Atk')}</li>
            <li><Badge>DEF</Badge>{t('petS7Def')}</li>
            <li><Badge>SPD</Badge>{t('petS7Spd')}</li>
            <li><Badge>LCK</Badge>{t('petS7Lck')}</li>
          </ul>
          <p>
            <b>{t('petS7RoundsBold')}</b>{t('petS7Para2B')}
          </p>
          <p>
            <b>{t('petS7LimitsA')}</b>{t('petS7LimitsB')}
            <br />
            <b>{t('petS7LbLabel')}</b>{t('petS7LbB')}
          </p>
        </CardContent>
      </Card>

      <Card id="settings">
        <CardHeader><CardTitle>{t('petS8Title')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t('petS8ParaA')}<code>/pet</code>{t('petS8ParaB')}<b>PetSettingsDialog</b>:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('petS8Item1')}</li>
            <li>{t('petS8Item2')}</li>
            <li>{t('petS8Item3')}</li>
            <li>{t('petS8Item4')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="voice">
        <CardHeader><CardTitle>9. Voice Lumi (Phase 8B)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            {t('petS9Para1')}
            {t('petS9Para2')}
          </p>
          <p>
            <Badge variant="outline">{t('petS9StatusLabel')}</Badge>{t('petS9StatusA')}
            <code>ELEVENLABS_API_KEY</code>{t('petS9StatusB')}
          </p>
        </CardContent>
      </Card>

      <Card id="nguyen-tac">
        <CardHeader><CardTitle>{t('petS10Title')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li><b>No gambling.</b>{t('petS10Item1B')}</li>
            <li><b>No pay-to-win.</b>{t('petS10Item2B')}</li>
            <li><b>{t('petS10Item3A')}</b>{t('petS10Item3B')}</li>
            <li><b>Audit-friendly.</b>{t('petS10Item4B')}</li>
            <li><b>Soulbound.</b>{t('petS10Item5B')}</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="faq">
        <CardHeader><CardTitle>FAQ</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold">{t('petFaq1Q')}</p>
            <p className="text-muted-foreground">{t('petFaq1A')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('petFaq2Q')}</p>
            <p className="text-muted-foreground">{t('petFaq2A')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('petFaq3QA')}<code>frozen</code>{t('petFaq3QB')}</p>
            <p className="text-muted-foreground">{t('petFaq3AA')}<Link className="text-primary hover:underline" to="/pet/appeal">/pet/appeal</Link>{t('petFaq3AB')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('petFaq4Q')}</p>
            <p className="text-muted-foreground">{t('petFaq4A')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('petFaq5Q')}</p>
            <p className="text-muted-foreground">{t('petFaq5A')}</p>
          </div>
        </CardContent>
      </Card>

      <Card id="changelog">
        <CardHeader><CardTitle>Changelog</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            <li><Badge variant="outline">Phase 1–5</Badge>{t('petCl1')}</li>
            <li><Badge variant="outline">Phase 6</Badge>{t('petCl2A')}<code>funtreasury</code>).</li>
            <li><Badge variant="outline">Phase 7</Badge>{t('petCl3')}</li>
            <li><Badge variant="outline">Phase 8A</Badge>{t('petCl4')}</li>
            <li><Badge>Phase 8B</Badge>{t('petCl5')}</li>
          </ul>
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground">
            {t('petClNote')}
          </p>
        </CardContent>
      </Card>

      <section className="mt-8 animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl p-8 sm:p-10 shadow-2xl ring-1 ring-white/20 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col items-center text-center gap-4">
            <div className="flex items-center gap-2 text-white">
              <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-lg" />
              <span className="text-4xl sm:text-5xl">🎮</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white drop-shadow">
              {t('petCtaTitle')}
            </h2>
            <p className="text-white/90 max-w-xl text-sm sm:text-base">
              {t('petCtaDesc')}
            </p>
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto h-auto px-8 py-6 text-lg sm:text-xl font-bold rounded-full bg-white text-purple-700 border-0 shadow-xl hover:bg-white hover:scale-105 hover:shadow-2xl transition-all duration-300"
            >
              <Link to="/pet">{t('petCtaButton')}</Link>
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 pt-2 text-sm">
              <Link to="/pet" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                {t('petCtaLink1')}
              </Link>
              <Link to="/pet/shop" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                🛍️ Shop CAMLY
              </Link>
              <Link to="/pet/arena" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                ⚔️ Arena 1v1
              </Link>
              <Link to="/pet/appeal" className="text-white/90 hover:text-white underline-offset-4 hover:underline">
                {t('petCtaLink4')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
