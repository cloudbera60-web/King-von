import config from '../../config.cjs';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const update = async (m, sock) => {
    // 1. Check for trigger word (case insensitive)
    const triggerWord = m.body?.toLowerCase().trim();
    if (triggerWord !== 'update') return;

    try {
        // 2. Verify permissions with robust array handling
        const botNumber = sock.user?.id.split(':')[0] + '@s.whatsapp.net';
        
        // Handle all possible OWNER_NUMBER formats
        let ownerNumbers = [];
        if (Array.isArray(config.OWNER_NUMBER)) {
            ownerNumbers = config.OWNER_NUMBER;
        } else if (typeof config.OWNER_NUMBER === 'string') {
            ownerNumbers = [config.OWNER_NUMBER];
        } else if (config.OWNER_NUMBER) {
            ownerNumbers = [String(config.OWNER_NUMBER)];
        }

        // Format numbers properly
        const allowedNumbers = [botNumber, ...ownerNumbers.map(num => {
            if (!num) return null;
            return num.includes('@') ? num : `${num.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        })].filter(Boolean);

        if (!allowedNumbers.includes(m.sender)) {
            return m.reply('❌ *Only bot owner can update!*');
        }

        // 3. Check GitHub for updates
        await m.reply('🔍 Checking for updates...');
        const { data: commit } = await axios.get(
            'https://api.github.com/repos/PRO-DEVELOPER-1/CORE-AI/commits/main',
            { timeout: 10000 }
        );
        
        // 4. Compare versions
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        const currentHash = packageData.commitHash || 'unknown';
        
        if (commit.sha === currentHash) {
            return m.reply('✅ Bot is already up-to-date!');
        }

        // 5. Download update
        await m.reply('📥 Downloading update...');
        const zipPath = path.join(process.cwd(), 'update.zip');
        const { data } = await axios.get(
            'https://github.com/PRO-DEVELOPER-1/CORE-AI/archive/main.zip',
            { 
                responseType: 'arraybuffer',
                timeout: 60000 
            }
        );
        fs.writeFileSync(zipPath, Buffer.from(data));

        // 6. Extract update
        await m.reply('📦 Extracting files...');
        const extractPath = path.join(process.cwd(), 'update');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);

        // 7. Copy files
        await m.reply('🔄 Updating files...');
        const updateSrc = path.join(extractPath, 'CORE-AI-main');
        
        // Create backup before updating
        const backupDir = path.join(process.cwd(), 'backup');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        fs.copyFileSync(packagePath, path.join(backupDir, 'package.json.bak'));
        
        // Perform update
        copyFolderSync(updateSrc, process.cwd());

        // 8. Cleanup
        fs.unlinkSync(zipPath);
        fs.rmSync(extractPath, { recursive: true, force: true });

        // 9. Restart
        await m.reply('♻️ Restarting bot...');
        process.exit(0);

    } catch (error) {
        console.error('Update error:', error);
        m.reply(`❌ Update failed: ${error.message}\nCheck console for details.`);
    }
};

// Helper function to copy folders with error handling
function copyFolderSync(src, dest) {
    try {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(file => {
            const srcPath = path.join(src, file);
            const destPath = path.join(dest, file);
            
            if (fs.lstatSync(srcPath).isDirectory()) {
                copyFolderSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        });
    } catch (copyError) {
        console.error('File copy failed:', copyError);
        throw new Error('Failed to copy files during update');
    }
}

export default update;
