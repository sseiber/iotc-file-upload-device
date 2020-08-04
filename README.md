# IoT Central file upload device sample
This sample demonstrates how to use the file upload feature of IoT Hub from within an IoT Central app. For a full description of the IoT Central File Upload feature see the [documentation online](https://apps.azureiotcentral.com).

## Prerequisites
* [Node.js](https://nodejs.org/en/download/)
* [Visual Studio Code](https://code.visualstudio.com/Download) with [TSLint](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-tslint-plugin) extension installed
* [Azure Blob Storage account](https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-portal)
* [IoT Central Application](https://docs.microsoft.com/en-us/azure/iot-central/core/quick-deploy-iot-central)

## Clone the repository
If you haven't already cloned the repository, use the following command to clone it to a suitable location on your local machine:
```
git clone https://github.com/sseiber/iotc-file-upload-device
```
Open the cloned repository with VS Code.

## Create an IoT Central application
Follow the instructions to create an IoT Central application and associate the application with your Azure Storage account. Add the device template to your application. The device template is included in the project here */setup/FileUploadDeviceDcm.json*

After creating the IoT Central Application and creating/importing the device template you are now ready to create a device and run the sample code.

## Create an IoT Device
In your IoT Central create a new device and use the device template you just imported. After the device is created select the device and use the Connect option to see the device connection details. Copy the ID scope, Device ID, and Primary Key. You will use these values in the device sample code.

## Run the sample code
Create a ".env" file at the root of your project and add the values you copied above. The file should look like the sample below with your own values. NOTE: the modelId is copied from the */setup/DeviceDcm.json* file.
```
scopeId=<YOUR_SCOPE_ID>
deviceId=<YOUR_DEVICE_ID>
deviceKey=<YOUR_PRIMARY_KEY>
modelId=urn:IoTCentral:IotCentralFileUploadDevice:1
```

Now you are ready to run the sample. Press F5 to run/debug the sample. In your terminal window you should see that the device is registered and is connected to IoT Central:
```
Starting IoT Central device...
 > Machine: ...
Starting device registration...
DPS registration succeeded
Connecting the device...
IoT Central successfully connected device: file-upload-device
```

## Upload a file
The sample project comes with a sample file named datafile.json. This will be the file that is uploaded when you use the Upload File command in your IoT Central application. To test this open your application and select the device you created. Select the Command tab and you should see a button named "Run". When you select that button the IoT Central app will call a direct method on your device to upload the file. You can see this direct method in the sample code in the */device.ts* file. The method is named *uploadFileCommand*.

The *uploadFileCommand* calls a method named *uploadFile*. This method gets the device setting for the folder path to use. By default this folder path is `Temp01` if you didn't change the setting. You can change this setting to another value using the "Settings" tab on your device. After getting the file name and some information about file to upload the code calls the built-in IoT Hub method `deviceClient.uploadToBlob` on the device client interface. This uses the IoT Hub file upload feature to stream the file to the associated Azure Blob storage.

This sample demonstrates the simplest way to upload generic files to an Azure Blob Storage account. The features of the IoT Hub take care of creating the SAS token for the connection. If you need more fine grained control of the features of Azure Blob Storage from your IoT Device then you will need to use the Azure Storage SDK directly in your Azure IoT Device project. To learn more about the Azure Blob Storage SDK see the [Azure Blob storage documentation](https://docs.microsoft.com/en-us/azure/storage/blobs/storage-blobs-introduction).