import HospitalLayout from '@/components/hospital/HospitalLayout';
import { AssetTrackingContent } from '@/pages/security/SecurityModulePages';

/** RFID/RTLS/BLE/GPS hospital asset tracking — embedded in Hospital OS context */
export default function HospitalAssetTracking() {
  return (
    <HospitalLayout
      title="Asset Tracking"
      subtitle="RFID · BLE · GPS — live inventory, movements, theft alarms & IoT tags"
    >
      <AssetTrackingContent />
    </HospitalLayout>
  );
}
