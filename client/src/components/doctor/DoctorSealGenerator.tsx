import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, RefreshCw, Check } from 'lucide-react';

interface DoctorSealGeneratorProps {
  doctorName: string;
  qualifications: string;
  registrationNumber: string;
  specialization?: string;
  onSealGenerated?: (sealDataUrl: string) => void;
  showControls?: boolean;
  className?: string;
  size?: number;
}

export const generateDoctorSeal = (
  canvas: HTMLCanvasElement,
  doctorName: string,
  qualifications: string,
  registrationNumber: string,
  specialization?: string,
  size: number = 200
): string => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  canvas.width = size;
  canvas.height = size;

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = (size / 2) - 10;

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // Main outer circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 8, 0, 2 * Math.PI);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Decorative dots
  const dotRadius = radius - 5;
  for (let i = 0; i < 36; i++) {
    const angle = (i * 10) * Math.PI / 180;
    const x = centerX + dotRadius * Math.cos(angle);
    const y = centerY + dotRadius * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(x, y, 1, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e3a5f';
    ctx.fill();
  }

  // Doctor name in circular path at top
  ctx.font = `bold ${size * 0.065}px Arial`;
  ctx.fillStyle = '#1e3a5f';
  ctx.textAlign = 'center';
  
  const displayName = `DR. ${doctorName.toUpperCase()}`;
  const textRadius = radius - 22;
  
  // Draw text along top arc
  const startAngle = -Math.PI / 2 - (displayName.length * 0.055);
  displayName.split('').forEach((char, i) => {
    const angle = startAngle + (i * 0.11);
    const x = centerX + textRadius * Math.cos(angle);
    const y = centerY + textRadius * Math.sin(angle);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });

  // Registration number along bottom arc
  const regText = `REG NO: ${registrationNumber}`;
  ctx.font = `${size * 0.05}px Arial`;
  const bottomStartAngle = Math.PI / 2 + (regText.length * 0.045);
  
  regText.split('').forEach((char, i) => {
    const angle = bottomStartAngle - (i * 0.09);
    const x = centerX + textRadius * Math.cos(angle);
    const y = centerY + textRadius * Math.sin(angle);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  });

  // Center content - Medical symbol
  ctx.font = `${size * 0.18}px serif`;
  ctx.fillStyle = '#1e3a5f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚕', centerX, centerY - 15);

  // Qualifications in center
  ctx.font = `bold ${size * 0.055}px Arial`;
  ctx.fillText(qualifications.toUpperCase(), centerX, centerY + 15);

  // Specialization if provided
  if (specialization) {
    ctx.font = `${size * 0.04}px Arial`;
    ctx.fillText(specialization.toUpperCase(), centerX, centerY + 32);
  }

  // Add horizontal decorative lines
  const lineY = centerY + (specialization ? 45 : 35);
  ctx.beginPath();
  ctx.moveTo(centerX - 40, lineY);
  ctx.lineTo(centerX + 40, lineY);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Small text at bottom center
  ctx.font = `${size * 0.035}px Arial`;
  ctx.fillStyle = '#1e3a5f';
  ctx.fillText('MEDICAL PRACTITIONER', centerX, lineY + 12);

  return canvas.toDataURL('image/png');
};

export const DoctorSealGenerator: React.FC<DoctorSealGeneratorProps> = ({
  doctorName,
  qualifications,
  registrationNumber,
  specialization,
  onSealGenerated,
  showControls = true,
  className = '',
  size = 200
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sealDataUrl, setSealDataUrl] = useState<string>('');
  const [isGenerated, setIsGenerated] = useState(false);

  useEffect(() => {
    if (canvasRef.current && doctorName && registrationNumber) {
      const dataUrl = generateDoctorSeal(
        canvasRef.current,
        doctorName,
        qualifications || 'MBBS',
        registrationNumber,
        specialization,
        size
      );
      setSealDataUrl(dataUrl);
      setIsGenerated(true);
      onSealGenerated?.(dataUrl);
    }
  }, [doctorName, qualifications, registrationNumber, specialization, size, onSealGenerated]);

  const handleRegenerate = () => {
    if (canvasRef.current) {
      const dataUrl = generateDoctorSeal(
        canvasRef.current,
        doctorName,
        qualifications || 'MBBS',
        registrationNumber,
        specialization,
        size
      );
      setSealDataUrl(dataUrl);
      onSealGenerated?.(dataUrl);
    }
  };

  const handleDownload = () => {
    if (sealDataUrl) {
      const link = document.createElement('a');
      link.download = `doctor-seal-${doctorName.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = sealDataUrl;
      link.click();
    }
  };

  const handleUse = () => {
    if (sealDataUrl && onSealGenerated) {
      onSealGenerated(sealDataUrl);
    }
  };

  return (
    <div className={`doctor-seal-generator ${className}`}>
      <div className="flex flex-col items-center">
        <div className="relative">
          <canvas 
            ref={canvasRef} 
            width={size} 
            height={size}
            className="border border-dashed border-gray-300 dark:border-gray-600 rounded-full bg-white"
          />
          {!isGenerated && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Enter details to generate seal
            </div>
          )}
        </div>

        {showControls && isGenerated && (
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={handleRegenerate}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            {onSealGenerated && (
              <Button size="sm" onClick={handleUse}>
                <Check className="h-4 w-4 mr-2" />
                Use This Seal
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Compact seal preview component
export const DoctorSealPreview: React.FC<{
  sealDataUrl: string;
  size?: number;
  className?: string;
}> = ({ sealDataUrl, size = 80, className = '' }) => {
  if (!sealDataUrl) {
    return (
      <div 
        className={`flex items-center justify-center border border-dashed border-gray-300 rounded-full text-xs text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
      >
        No Seal
      </div>
    );
  }

  return (
    <img 
      src={sealDataUrl} 
      alt="Doctor Seal" 
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default DoctorSealGenerator;
