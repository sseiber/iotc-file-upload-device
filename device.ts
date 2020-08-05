import { Mqtt } from 'azure-iot-device-mqtt';
import { SymmetricKeySecurityClient } from 'azure-iot-security-symmetric-key';
import { ProvisioningDeviceClient } from 'azure-iot-provisioning-device';
import { Mqtt as ProvisioningTransport } from 'azure-iot-provisioning-device-mqtt';
import {
    Client as IoTDeviceClient,
    Twin,
    Message as IoTMessage,
    DeviceMethodRequest,
    DeviceMethodResponse
} from 'azure-iot-device';
import {
    extname as pathExtName,
    basename as pathBaseName
} from 'path';
import {
    stat as fsStat,
    createReadStream as fsCreateReadStream
} from 'fs';
import * as moment from 'moment';
import { log } from 'util';

const dpsProvisioningHost: string = 'global.azure-devices-provisioning.net';

const CommandUploadFile = 'COMMAND_UPLOAD_FILE';
const TelemetrySystemHeartbeat = 'TELEMETRY_SYSTEM_HEARTBEAT';
const EventUploadFile = 'EVENT_UPLOAD_FILE';
const SettingFilenameSuffix = 'SETTING_FILENAME_SUFFIX';
const CommandResponseStatusCode = 'COMMANDRESPONSE_STATUSCODE';
const CommandResponseMessage = 'COMMANDRESPONSE_MESSAGE';
const CommandResponseData = 'COMMANDRESPONSE_DATA';

interface IDeviceSettings {
    [SettingFilenameSuffix]: string;
}

export class IoTCentralDevice {
    private log: (message: string) => void;
    private scopeId: string;
    private deviceId: string;
    private deviceKey: string;
    private modelId: string;

    private deviceClient: IoTDeviceClient;
    private deviceTwin: Twin;
    private deviceSettings: IDeviceSettings;

    constructor(logFunc: (message: string) => void, scopeId: string, deviceId: string, deviceKey: string, modelId: string) {
        this.log = logFunc;
        this.scopeId = scopeId;
        this.deviceId = deviceId;
        this.deviceKey = deviceKey;
        this.modelId = modelId;

        this.deviceSettings = {
            [SettingFilenameSuffix]: moment.utc().format('YYYYMMDD-HHmmss')
        };
    }

    public async provisionDeviceClient(): Promise<string> {
        let connectionString = '';

        try {
            const provisioningSecurityClient = new SymmetricKeySecurityClient(this.deviceId, this.deviceKey);
            const provisioningClient = ProvisioningDeviceClient.create(
                dpsProvisioningHost,
                this.scopeId,
                new ProvisioningTransport(),
                provisioningSecurityClient
            );

            const provisioningPayload = {
                iotcModelId: this.modelId
            };

            provisioningClient.setProvisioningPayload(provisioningPayload);

            connectionString = await new Promise<string>((resolve, reject) => {
                provisioningClient.register((dpsError, dpsResult) => {
                    if (dpsError) {
                        return reject(dpsError);
                    }

                    this.log('DPS registration succeeded');

                    return resolve(`HostName=${dpsResult.assignedHub};DeviceId=${dpsResult.deviceId};SharedAccessKey=${this.deviceKey}`);
                });
            });
        }
        catch (ex) {
            this.log(`Failed to instantiate client interface from configuration: ${ex.message}`);
        }

        return connectionString;
    }

    public async connectDeviceClient(connectionString: string) {
        try {
            this.deviceClient = await IoTDeviceClient.fromConnectionString(connectionString, Mqtt);
            if (!this.deviceClient) {
                this.log(`Failed to connect device client interface from connection string - device: ${this.deviceId}`);
                return;
            }

            setInterval(async () => {
                await this.getHealth();
            }, 1000 * 30);

            await this.deviceClient.open();

            this.deviceTwin = await this.deviceClient.getTwin();
            this.deviceTwin.on('properties.desired', this.onHandleDeviceProperties.bind(this));

            this.deviceClient.on('error', this.onDeviceClientError.bind(this));

            this.deviceClient.onDeviceMethod(CommandUploadFile, this.uploadFileCommand.bind(this));

            this.log(`IoT Central successfully connected device: ${this.deviceId}`);
        }
        catch (ex) {
            this.log(`IoT Central connection error: ${ex.message}`);
        }
    }

    private async getHealth(): Promise<void> {
        await this.sendMeasurement({
            [TelemetrySystemHeartbeat]: 1
        });
    }

    private async onHandleDeviceProperties(desiredChangedSettings: any) {
        try {
            const patchedProperties = {};

            for (const setting in desiredChangedSettings) {
                if (!desiredChangedSettings.hasOwnProperty(setting)) {
                    continue;
                }

                if (setting === '$version') {
                    continue;
                }

                const value = desiredChangedSettings[setting];

                switch (setting) {
                    case SettingFilenameSuffix:
                        this.log(`Updating setting: ${setting} with value: ${value}`);

                        // NOTE: validation should be in place for legal folder names
                        patchedProperties[setting] = this.deviceSettings[setting] = value || moment.utc().format('YYYYMMDD-HHmmss');
                        break;

                    default:
                        this.log(`Received desired property change for unknown setting '${setting}'`);
                        break;
                }
            }

            for (const key in patchedProperties) {
                if (patchedProperties.hasOwnProperty(key)) {
                    await this.updateDeviceProperties(patchedProperties);
                    break;
                }
            }
        }
        catch (ex) {
            this.log(`Exception while handling desired properties: ${ex.message}`);
        }
    }

    private onDeviceClientError(error: Error) {
        this.log(`Device client connection error: ${error.message}`);
    }

    private async sendMeasurement(data: any): Promise<void> {
        if (!data || !this.deviceClient) {
            return;
        }

        try {
            this.log(`Sending telemetry: ${JSON.stringify(data, null, 4)}`);

            const iotcMessage = new IoTMessage(JSON.stringify(data));

            await this.deviceClient.sendEvent(iotcMessage);
        }
        catch (ex) {
            this.log(`sendMeasurement: ${ex.message}`);
        }
    }

    private async updateDeviceProperties(properties: any): Promise<void> {
        if (!properties || !this.deviceTwin) {
            return;
        }

        this.log(`Updating twin properties: ${JSON.stringify(properties, null, 4)}`);

        try {
            await new Promise((resolve, reject) => {
                this.deviceTwin.properties.reported.update(properties, (error) => {
                    if (error) {
                        return reject(error);
                    }

                    return resolve();
                });
            });
        }
        catch (ex) {
            this.log(`Error updating device properties: ${ex.message}`);
        }
    }

    private async getFileStats(filePath: string): Promise<any> {
        let fileStats = {};

        try {
            fileStats = await new Promise((resolve, reject) => {
                fsStat(filePath, (err, stats) => {
                    if (err) {
                        return reject(err);
                    }

                    return resolve(stats);
                });
            });
        }
        catch (ex) {
            log(`An error occurred while getting file stats: ${ex.message}`);
        }

        return fileStats;
    }

    private async uploadFile(filePath: string): Promise<string> {
        let result = '';

        try {
            const blobNameSuffix = this.deviceSettings[SettingFilenameSuffix];
            const fileExtName = pathExtName(filePath);
            const fileBaseName = pathBaseName(filePath, fileExtName);
            const fileStats = await this.getFileStats(filePath);
            const blobFilename = `${fileBaseName}-${blobNameSuffix}${fileExtName}`;
            const readableStream = fsCreateReadStream(filePath);

            this.log(`uploadContent - data length: ${fileStats.size}, blob filename: ${blobFilename}`);

            await this.deviceClient.uploadToBlob(blobFilename, readableStream, fileStats.size);

            await this.sendMeasurement({
                [EventUploadFile]: `${blobFilename}`
            });

            this.log('File upload succeeded');

            result = blobFilename;
        }
        catch (ex) {
            this.log(`Error during deviceClient.uploadToBlob: ${ex.message}`);
        }

        return result;
    }

    // @ts-ignore (commandRequest)
    private async uploadFileCommand(commandRequest: DeviceMethodRequest, commandResponse: DeviceMethodResponse) {
        this.log('Received upload file command');

        const blobFilename = await this.uploadFile('./datafile.json');

        await commandResponse.send(200);
        await this.updateDeviceProperties({
            [CommandUploadFile]: {
                value: {
                    [CommandResponseStatusCode]: 202,
                    [CommandResponseMessage]: `deviceId: ${this.deviceId} upload a file to the Azure storage container at: ${blobFilename}`,
                    [CommandResponseData]: ''
                }
            }
        });
    }
}
