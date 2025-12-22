const fs = require('fs');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

const files = [
    'GetClaimIntimationDetails.docx',
    'GetClaimsList.docx',
    'GetEnrollmentDetails.docx',
    'GetMemberECardURL.docx',
    'GetNetworkHospitalCount.docx',
    'GetNetworkHospitals.docx',
    'Sample_Request_And_Response.docx'
];

const dir = '/home/ubuntu/Mediczy/API_Kits/Heritage_TPA/Heritage';

files.forEach(fileName => {
    const filePath = `${dir}/${fileName}`;
    const zip = new AdmZip(filePath);
    const xmlData = zip.readAsText('word/document.xml');
    
    xml2js.parseString(xmlData, (err, result) => {
        if (err) {
            console.error(`Error parsing ${fileName}:`, err);
            return;
        }
        
        let text = '';
        const extractText = (obj) => {
            if (!obj) return;
            if (Array.isArray(obj)) {
                obj.forEach(extractText);
            } else if (typeof obj === 'object') {
                if (obj['w:t']) {
                    text += obj['w:t'] + ' ';
                }
                Object.values(obj).forEach(extractText);
            }
        };
        
        extractText(result);
        
        const outputFile = filePath.replace('.docx', '.txt');
        fs.writeFileSync(outputFile, text);
        console.log(`Extracted: ${fileName} -> ${fileName.replace('.docx', '.txt')}`);
    });
});
