import { useId, type CSSProperties } from 'react';

/**
 * FUN ECOSYSTEM logo — giữ nguyên 100% ảnh nhận diện gốc. Thêm MỘT dải ánh
 * sáng dạng "sao chổi" màu cầu vồng hologram, đầu trắng nóng rực, đuôi
 * thuôn & mờ dần, chạy liên tục & mượt theo hình số 8 dọc ống ∞.
 *
 * Kỹ thuật (thuần CSS, không SMIL):
 *  - Đường ray vô hình bám đúng đường tâm ống ∞. Tại điểm giao, hai nhánh đi
 *    xuyên thẳng theo 2 đường chéo → lượn số 8 mượt, không bẻ cua.
 *  - Nhiều lớp <path> nét đứt chồng nhau; CSS animate stroke-dashoffset để
 *    đoạn sáng chạy vòng. Lớp ngoài rộng + gradient cầu vồng + blur mạnh =
 *    quầng hologram; lớp trong trắng đặc = đầu sáng nóng. Mép đầu mọi lớp
 *    trùng nhau (bù offset theo HEAD_LEN - dash).
 *  - Cầu vồng "chảy": stroke là linearGradient nhiều màu lặp lại trong không
 *    gian; cả cụm còn được CSS animate filter: hue-rotate() để lấp lánh
 *    hologram + saturate/brightness cho sáng mạnh hơn.
 *  - Blend "screen" → chỉ làm bừng sáng, không phủ màu tĩnh lên logo.
 *  - Chạy liên tục bất kể cài đặt "Reduce Motion" của hệ điều hành.
 */
export default function FunEcosystemLogo({ size }: { size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rainbowId = `funInfRainbow-${uid}`;
  const blurXL = `funInfBlurXL-${uid}`;
  const blurBig = `funInfBlurBig-${uid}`;
  const blurMid = `funInfBlurMid-${uid}`;
  const blurSpark = `funInfBlurSpark-${uid}`;

  // Đường ray vô hình: bám đúng đường TÂM ống ∞ (viewBox 1024), hiệu chỉnh
  // bằng cách overlay path lên fun-ecosystem-center.png. Tại điểm giao
  // ~(522,512) hai nhánh xuyên thẳng theo 2 đường chéo → số 8 mượt.
  const PATH =
    'M 522 512 C 560 474, 600 430, 652 430 C 704 430, 762 462, 762 500 C 762 548, 720 600, 664 600 C 616 604, 560 550, 522 512 C 484 474, 410 440, 378 442 C 322 444, 284 480, 284 524 C 284 570, 330 616, 394 616 C 452 616, 484 550, 522 512 Z';

  const LEN = 1000; // pathLength chuẩn hoá → dash tính theo phần nghìn
  const DUR = 4; // giây / vòng ∞
  const HEAD_LEN = 280; // độ dài "đuôi" dài nhất (‰ path)

  const RB = `url(#${rainbowId})`;
  // ngoài cùng rộng + cầu vồng + mờ (đuôi/quầng hologram) → trong cùng hẹp +
  // trắng đặc (đầu nóng rực). Có 1 lớp bloom trắng để đẩy độ sáng.
  const layers = [
    { w: 150, stroke: RB, dash: 280, opacity: 0.42, filter: blurXL },
    { w: 92, stroke: RB, dash: 220, opacity: 0.66, filter: blurBig },
    { w: 66, stroke: '#ffffff', dash: 150, opacity: 0.4, filter: blurBig },
    { w: 44, stroke: RB, dash: 140, opacity: 0.95, filter: blurMid },
    { w: 22, stroke: '#ffffff', dash: 70, opacity: 0.98, filter: blurMid },
    { w: 9, stroke: '#ffffff', dash: 26, opacity: 1, filter: undefined },
  ];

  const SPARK_PATH = 'M0,-52 L11,-11 L52,0 L11,11 L0,52 L-11,11 L-52,0 L-11,-11 Z';

  return (
    <div
      className="group relative rounded-full"
      style={{ width: size, height: size }}
    >
      <img
        src="/fun-ecosystem-center.png"
        alt="FUN Ecosystem — biểu tượng vô cực năng lượng ánh sáng"
        style={{ width: size, height: size }}
        loading="lazy"
        className="object-contain rounded-full"
      />

      <svg
        viewBox="0 0 1024 1024"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          {/* Cầu vồng hologram lặp lại trong không gian (theo trục nghiêng của ∞) */}
          <linearGradient
            id={rainbowId}
            gradientUnits="userSpaceOnUse"
            x1="250"
            y1="380"
            x2="540"
            y2="650"
            spreadMethod="repeat"
          >
            <stop offset="0" stopColor="#ff4d6d" />
            <stop offset="0.16" stopColor="#ff9e3d" />
            <stop offset="0.33" stopColor="#ffef5c" />
            <stop offset="0.5" stopColor="#5cf2a3" />
            <stop offset="0.66" stopColor="#4fd0ff" />
            <stop offset="0.83" stopColor="#b06bff" />
            <stop offset="1" stopColor="#ff4d6d" />
          </linearGradient>
          <filter id={blurXL} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
          <filter id={blurBig} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id={blurMid} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id={blurSpark} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        <g
          className="fun-infinity-glow transition-opacity duration-500 group-hover:opacity-100"
          style={{ mixBlendMode: 'screen' }}
        >
          <g className="fun-inf-holo">
            {layers.map((l, i) => {
              const shift = HEAD_LEN - l.dash; // để mép đầu các lớp trùng nhau
              const style = {
                '--fun-inf-dur': `${DUR}s`,
                '--fun-inf-to': -shift,
              } as CSSProperties;
              return (
                <path
                  key={i}
                  className="fun-inf-layer"
                  d={PATH}
                  pathLength={LEN}
                  fill="none"
                  stroke={l.stroke}
                  strokeWidth={l.w}
                  strokeLinecap="round"
                  opacity={l.opacity}
                  filter={l.filter ? `url(#${l.filter})` : undefined}
                  strokeDasharray={`${l.dash} ${LEN - l.dash}`}
                  strokeDashoffset={LEN - shift}
                  style={style}
                />
              );
            })}

            {/* Ngôi sao lấp lánh trắng nóng ngay tại MÉP ĐẦU dải sáng. */}
            <path
              className="fun-inf-spark"
              d={SPARK_PATH}
              fill="#fff"
              filter={`url(#${blurSpark})`}
              style={
                {
                  '--fun-inf-dur': `${DUR}s`,
                  '--fun-inf-spark-delay': `${-(HEAD_LEN / LEN) * DUR}s`,
                  offsetPath: `path('${PATH}')`,
                  offsetDistance: '0%',
                } as CSSProperties
              }
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
