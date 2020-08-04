import {
    type as osType,
    cpus as osCpus,
    freemem as osFreeMem,
    totalmem as osTotalMem
} from 'os';
import { IoTCentralDevice } from './device';

function log(message: string) {
    // tslint:disable-next-line:no-console
    console.log(message);
}

async function start() {
    try {
        log('🚀 Starting IoT Central device...');
        log(` > Machine: ${osType()}, ${osCpus().length} core, `
            + `freemem=${(osFreeMem() / 1024 / 1024).toFixed(0)}mb, totalmem=${(osTotalMem() / 1024 / 1024).toFixed(0)}mb`);

        const {
            scopeId,
            deviceId,
            deviceKey,
            modelId
        } = process.env;

        if (!scopeId || !deviceId || !deviceKey || !modelId) {
            log('Error - missing required environment variables scopeId, deviceId, deviceKey, modelId');
            return;
        }

        const iotDevice = new IoTCentralDevice(log, scopeId, deviceId, deviceKey, modelId);

        const connectionString = await iotDevice.provisionDeviceClient();

        if (connectionString) {
            await iotDevice.connectDeviceClient(connectionString);
        }
        else {
            log(' Failed to obtain connection string for device.');
        }
    }
    catch (error) {
        log(`👹 Error starting process: ${error.message}`);
    }
}

(async () => {
    await start();
})().catch();
