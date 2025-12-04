// FIX: Use window.pdfjsLib as it's a global variable.
if (typeof window.pdfjsLib !== 'undefined') {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
}

/**
 * Sanitizes a string to remove characters that are invalid in XML 1.0.
 * This is necessary because the docx library creates an XML-based file, and invalid
 * characters (like certain control characters) will cause it to throw an error.
 * @param str The input string.
 * @returns A sanitized string with invalid XML characters removed.
 */
const sanitizeXmlString = (str: string): string => {
    if (!str) return '';
    // eslint-disable-next-line no-control-regex
    return str.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '');
};


export const readPdfAsText = async (file: File): Promise<string> => {
    // FIX: Use window.pdfjsLib and add a check for its existence.
    if (typeof window.pdfjsLib === 'undefined') {
        throw new Error('pdf.js library is not loaded.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdfData = new Uint8Array(arrayBuffer);
    const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
    let textContent = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        textContent += text.items.map((item: any) => item.str).join(' ');
    }
    // OCR fallback for scanned PDFs if very little text extracted
    if (textContent.trim().length < 50 && typeof (window as any).Tesseract !== 'undefined') {
        try {
            let ocrText = '';
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return textContent;
            for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/png');
                const { data: { text } } = await (window as any).Tesseract.recognize(dataUrl, 'eng');
                ocrText += ` ${text}`;
            }
            if (ocrText.trim().length > textContent.length) {
                return ocrText;
            }
        } catch (e) {
            console.warn('OCR fallback failed, returning original text.', e);
        }
    }
    return textContent;
};

export const readDocxAsText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    if (typeof window.mammoth === 'undefined') {
        throw new Error('Mammoth.js library not loaded. Cannot read .docx file.');
    }
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value;
};

export const extractHeaderImageFromTemplate = async (file: File): Promise<string | null> => {
    // Accept PDF or Image; for PDF render first page and crop the top area as header
    try {
        if (file.type === 'application/pdf') {
            if (typeof window.pdfjsLib === 'undefined') throw new Error('pdf.js library is not loaded.');
            const arrayBuffer = await file.arrayBuffer();
            const pdfData = new Uint8Array(arrayBuffer);
            const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            // Return full first page image to cover the page corner-to-corner
            return canvas.toDataURL('image/png');
        }
        if (file.type.startsWith('image/')) {
            // Directly use the image as header
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('Failed to read image'));
                reader.readAsDataURL(file);
            });
        }
        // DOCX not supported for graphical header extraction in-browser; return null
        return null;
    } catch {
        return null;
    }
};

/**
 * Populate a Word template with generated content
 * Uses JSZip to modify the Word document XML and insert content
 */
/**
 * Populate a Word template with generated content (preserving ALL formatting)
 * Strategy: Generate formatted document using docx library, extract its XML, merge into template
 */
export const populateWordTemplate = async (templateFile: File, content: string, filename: string, replacements?: { [key: string]: string }): Promise<void> => {
    try {
        if (typeof (window as any).JSZip === 'undefined') {
            throw new Error('JSZip library not loaded');
        }
        
        if (typeof docx === 'undefined' || !docx || !docx.Document) {
            throw new Error('docx library not loaded');
        }
        
        const JSZip = (window as any).JSZip;
        const { Document, Packer, Header, ImageRun, TextWrappingType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionAlign } = docx;
        
        // NEW APPROACH: Extract letterhead image and use docx library to create document with header
        // This preserves all formatting including bullets since everything is generated by docx library
        console.log('🔄 Using docx library approach with header image...');
        
        // Extract letterhead image from template
        const templateBuffer = await templateFile.arrayBuffer();
        const templateZip = await JSZip.loadAsync(templateBuffer);
        
        let letterheadImageData: Uint8Array | null = null;
        let letterheadImagePath: string | null = null;
        
        // Find letterhead image in template
        for (const [path, file] of Object.entries(templateZip.files)) {
            if (typeof file !== 'object' || file.dir) continue;
            if (path.startsWith('word/media/') && (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg'))) {
                letterheadImageData = await (file as any).async('uint8array');
                letterheadImagePath = path;
                console.log(`Found letterhead image: ${path}`);
                break;
            }
        }
        
        // If we have a letterhead, use docx library to create document with header
        if (letterheadImageData && letterheadImagePath) {
            console.log('✅ Creating document with letterhead using docx library...');
            
            // Convert image data to base64 for docx library
            // Use chunked approach to avoid stack overflow
            const chunks: string[] = [];
            const chunkSize = 8192;
            for (let i = 0; i < letterheadImageData.length; i += chunkSize) {
                const chunk = letterheadImageData.slice(i, i + chunkSize);
                chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
            }
            const imageBase64 = btoa(chunks.join(''));
            
            // Determine image format
            const imageFormat = letterheadImagePath.endsWith('.png') ? 'png' : 'jpeg';
            const imageDataUri = `data:image/${imageFormat};base64,${imageBase64}`;
            
            // Generate formatted document with header
            const formattedDocBlob = await generateFormattedDocumentBlobWithHeader(content, imageDataUri, imageFormat);
            
            // Save the document
            if (typeof saveAs !== 'undefined') {
                saveAs(formattedDocBlob, filename);
                console.log('✅ Document created successfully with letterhead and bullets');
                return;
            } else {
                throw new Error('FileSaver.js not loaded');
            }
        }
        
        // Fallback to original approach if no letterhead found
        console.log('⚠️ No letterhead image found, using XML merge approach...');
        
        // Step 1: Generate a fully formatted document using our existing formatting logic
        console.log('Generating formatted document from content...');
        console.log('📄 Content preview (first 1000 chars):', content.substring(0, 1000));
        console.log('📄 Content length:', content.length);
        console.log('📄 Content includes ABUSE_SUMMARY:', content.includes('{{ABUSE_SUMMARY}}') || content.includes('Psychological Abuse') || content.includes('Verbal Abuse'));
        const formattedDocBlob = await generateFormattedDocumentBlob(content);
        
        // Step 2: Extract the formatted content XML from the generated document
        console.log('Extracting formatted content XML...');
        const formattedDocZip = await JSZip.loadAsync(await formattedDocBlob.arrayBuffer());
        const formattedDocXml = await formattedDocZip.file('word/document.xml')?.async('string');
        if (!formattedDocXml) {
            throw new Error('Could not extract formatted content XML');
        }
        
        // Also extract numbering styles (needed for bullets) if they exist
        const formattedNumbering = await formattedDocZip.file('word/numbering.xml')?.async('string');
        const formattedStyles = await formattedDocZip.file('word/styles.xml')?.async('string');
        
        console.log('Extracted document XML, checking for numbering/styles...');
        if (formattedNumbering) {
            console.log('Found numbering.xml in formatted document');
        }
        if (formattedStyles) {
            console.log('Found styles.xml in formatted document');
        }
        
        // Step 3: Extract just the body content (paragraphs) from formatted document
        // Find <w:body> and </w:body> to extract only the paragraphs
        const bodyStartMatch = formattedDocXml.match(/<w:body[^>]*>/);
        if (!bodyStartMatch) {
            throw new Error('Could not find <w:body> in formatted document');
        }
        const bodyStartIndex = formattedDocXml.indexOf(bodyStartMatch[0]) + bodyStartMatch[0].length;
        const bodyEndIndex = formattedDocXml.indexOf('</w:body>');
        if (bodyEndIndex === -1) {
            throw new Error('Could not find </w:body> in formatted document');
        }
        
        // Extract all content between <w:body> and </w:body>
        let formattedBodyContent = formattedDocXml.substring(bodyStartIndex, bodyEndIndex);
        console.log('Extracted formatted body content, length:', formattedBodyContent.length);
        
        // CRITICAL: Extract numbering IDs from formatted document to verify they match
        // Check what numbering IDs are used in the body content
        const numIdMatches = formattedBodyContent.match(/w:numId="(\d+)"/g);
        const uniqueNumIds = numIdMatches ? [...new Set(numIdMatches.map(m => m.match(/\d+/)?.[0]))] : [];
        console.log('📋 Numbering IDs found in body content:', uniqueNumIds);
        
        // Check numbering.xml structure to ensure IDs match
        if (formattedNumbering) {
            const numDefMatches = formattedNumbering.match(/<w:num w:numId="(\d+)">/g);
            const numIdsInNumbering = numDefMatches ? numDefMatches.map(m => m.match(/\d+/)?.[0]) : [];
            console.log('📋 Numbering IDs defined in numbering.xml:', numIdsInNumbering);
            
            // Verify all body content numbering IDs exist in numbering.xml
            const missingIds = uniqueNumIds.filter(id => !numIdsInNumbering.includes(id));
            if (missingIds.length > 0) {
                console.warn('⚠️ WARNING: Body content references numbering IDs not in numbering.xml:', missingIds);
            } else {
                console.log('✅ All numbering IDs in body content match numbering.xml');
            }
        }
        
        // Step 4: Extract ALL files from template as raw data - COMPLETELY DIFFERENT APPROACH
        // Extract files and IMMEDIATELY release the JSZip instance to avoid readonly property inheritance
        console.log('Reading template file and extracting all files...');
        // Reuse templateBuffer from earlier (already loaded at line 131)
        // const templateBuffer = await templateFile.arrayBuffer(); // Already declared above
        
        // Extract files in an isolated scope
        const templateFiles = new Map<string, Uint8Array>();
        {
            const templateZipLoaded = await JSZip.loadAsync(templateBuffer);
            const templateExtractPromises: Array<Promise<void>> = [];
            
            templateZipLoaded.forEach((relativePath, file) => {
                if (!file.dir) {
                    templateExtractPromises.push(
                        file.async('uint8array').then((data: Uint8Array) => {
                            // Clone immediately to avoid any references to JSZip's internal buffers
                            templateFiles.set(relativePath, new Uint8Array(data));
                        }).catch((err) => {
                            console.warn(`Failed to extract template file ${relativePath}:`, err);
                        })
                    );
                }
            });
            
            await Promise.all(templateExtractPromises);
        }
        // templateZipLoaded goes out of scope here, ensuring no references remain
        // Force garbage collection hint (may not work in all browsers, but doesn't hurt)
        if (typeof (globalThis as any).gc === 'function') {
            (globalThis as any).gc();
        }
        
        console.log(`Extracted ${templateFiles.size} files from template`);
        
        // Step 5: Read template's document.xml from extracted files
        const templateDocXmlData = templateFiles.get('word/document.xml');
        if (!templateDocXmlData) {
            throw new Error('Could not find document.xml in template');
        }
        // Convert Uint8Array to string
        let templateDocXml = new TextDecoder('utf-8').decode(templateDocXmlData);
        
        // Step 5b: Replace any placeholders in the template XML itself
        // This handles cases where the Word template file has placeholders that need to be replaced
        const replacePlaceholderInXml = (xml: string, placeholder: string, value: string): string => {
            // Escape special regex characters
            const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Handle both straight apostrophe (') and curly apostrophe (')
            const pattern1 = escaped.replace(/'/g, "'");
            const pattern2 = escaped.replace(/'/g, "'");
            let result = xml.replace(new RegExp(pattern1, 'g'), value);
            if (pattern1 !== pattern2) {
                result = result.replace(new RegExp(pattern2, 'g'), value);
            }
            return result;
        };
        
        // Extract common replacement values from content
        // Extract date (look for common date formats at the beginning of content)
        const dateMatch = content.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/m);
        if (dateMatch) {
            const dateValue = dateMatch[0];
            templateDocXml = replacePlaceholderInXml(templateDocXml, "{{TODAY'S DATE}}", dateValue);
            templateDocXml = replacePlaceholderInXml(templateDocXml, "{{TODAY'S DATE}}", dateValue);
        }
        
        // If replacements map is provided, apply all of them
        if (replacements) {
            for (const [placeholder, value] of Object.entries(replacements)) {
                templateDocXml = replacePlaceholderInXml(templateDocXml, placeholder, value);
            }
        }
        
        // Step 6: Find where to insert content in template
        // Look for </w:body> and insert formatted content before it
        const templateBodyEnd = templateDocXml.indexOf('</w:body>');
        if (templateBodyEnd === -1) {
            throw new Error('Could not find document body in template');
        }
        
        // Step 7: Clean the formatted body content to ensure valid XML
        // Remove any XML declarations or invalid elements that might cause corruption
        let cleanedFormattedContent = formattedBodyContent.trim();
        
        // Ensure we have valid paragraph elements
        if (!cleanedFormattedContent.includes('<w:p>')) {
            throw new Error('Extracted content does not contain valid paragraphs');
        }
        
        // Validate XML structure - ensure all tags are properly closed
        // Count opening and closing paragraph tags
        const openP = (cleanedFormattedContent.match(/<w:p[^>]*>/g) || []).length;
        const closeP = (cleanedFormattedContent.match(/<\/w:p>/g) || []).length;
        if (openP !== closeP) {
            console.warn('Warning: Paragraph tags mismatch', { openP, closeP });
            // Try to fix by ensuring proper structure
        }
        
        // Step 8: Merge formatted content into template (preserve template's structure)
        // Make sure we're not breaking the XML structure
        // Check if template body already has content
        const templateBodyStart = templateDocXml.indexOf('<w:body');
        const templateBodyStartEnd = templateDocXml.indexOf('>', templateBodyStart);
        const existingContent = templateDocXml.substring(templateBodyStartEnd + 1, templateBodyEnd).trim();
        
        // Insert formatted content after any existing content in template
        const mergedXml = templateDocXml.substring(0, templateBodyEnd) + 
                         (existingContent ? '\n' : '') + cleanedFormattedContent + 
                         templateDocXml.substring(templateBodyEnd);
        
        // Step 9: Update template files Map with merged content (modify as strings, not JSZip)
        // Convert merged XML to Uint8Array and update the Map
        // REMOVED: All bullet conversion code - formatted document already uses bullets from docx library
        const mergedXmlBytes = new TextEncoder().encode(mergedXml);
        templateFiles.set('word/document.xml', mergedXmlBytes);
        console.log('Updated document.xml in template files Map');
        
        // Step 9b: Copy numbering.xml from formatted document if it exists
        // Don't modify it - just use it as-is since formatted document already has bullets
        if (formattedNumbering) {
            const numberingBytes = new TextEncoder().encode(formattedNumbering);
            templateFiles.set('word/numbering.xml', numberingBytes);
            console.log('Copied numbering.xml from formatted document (already has bullets)');
        }
        
        // Step 10: Copy relationships XML from formatted document if numbering exists
        // This ensures numbering.xml is properly referenced
        const formattedRelsXml = await formattedDocZip.file('word/_rels/document.xml.rels')?.async('string');
        const templateRelsData = templateFiles.get('word/_rels/document.xml.rels');
        let templateRelsXml: string | null = null;
        if (templateRelsData) {
            templateRelsXml = new TextDecoder('utf-8').decode(templateRelsData);
        }
        
        if (templateRelsXml && formattedRelsXml && formattedNumbering) {
            const numberingRelMatch = formattedRelsXml.match(/<Relationship[^>]*Target="numbering\.xml"[^>]*\/>/);
            if (numberingRelMatch) {
                if (!templateRelsXml.includes('numbering.xml')) {
                    // Add numbering relationship if not present
                    const relsEndIndex = templateRelsXml.indexOf('</Relationships>');
                    if (relsEndIndex !== -1) {
                        const mergedRels = templateRelsXml.substring(0, relsEndIndex) + 
                                         '\n    ' + numberingRelMatch[0] + 
                                         templateRelsXml.substring(relsEndIndex);
                        templateFiles.set('word/_rels/document.xml.rels', new TextEncoder().encode(mergedRels));
                        console.log('Added numbering relationship to template');
                    }
                } else {
                    // Numbering relationship already exists, keep template's version
                    console.log('Template already has numbering relationship');
                }
            }
        }
        
        // Step 11: Copy media files from formatted document
        const mediaPromises: Array<Promise<void>> = [];
        formattedDocZip.forEach((relativePath, file) => {
            if (relativePath.startsWith('word/media/')) {
                mediaPromises.push(
                    file.async('uint8array').then((data: Uint8Array) => {
                        // Only add if not already in template (preserve template's media)
                        if (!templateFiles.has(relativePath)) {
                            templateFiles.set(relativePath, data);
                        }
                    })
                );
            }
        });
        await Promise.all(mediaPromises);
        console.log('Media files processed');
        
        // Step 12: Reconstruct ZIP file - load template ZIP and update only changed files
        // This preserves all template files including letterhead images
        console.log('Reconstructing ZIP file from template...');
        
        try {
            // Load the original template ZIP fresh - this preserves all files including letterhead
            const templateBuffer = await templateFile.arrayBuffer();
            const outputZip = await JSZip.loadAsync(templateBuffer);
            
            // Update document.xml with merged content (convert to string for JSZip)
            const mergedDocXml = templateFiles.get('word/document.xml');
            if (mergedDocXml) {
                const docXmlString = new TextDecoder('utf-8').decode(mergedDocXml);
                
                // Verify numbering references are present in merged document.xml
                const numIdRefs = docXmlString.match(/w:numId="(\d+)"/g);
                const numIdsInDoc = numIdRefs ? [...new Set(numIdRefs.map(m => m.match(/\d+/)?.[0]))] : [];
                console.log('📋 Numbering IDs referenced in merged document.xml:', numIdsInDoc);
                
                if (numIdsInDoc.length === 0) {
                    console.warn('⚠️ WARNING: No numbering references found in merged document.xml - bullets will not appear');
                } else {
                    console.log('✅ Found numbering references in merged document.xml');
                }
                
                outputZip.file('word/document.xml', docXmlString);
            }
            
            // Update numbering.xml if it exists (from formatted document - preserves bullets)
            // CRITICAL: Always replace template's numbering.xml with formatted document's version
            // This ensures bullets are preserved instead of numbers
                        if (templateFiles.has('word/numbering.xml')) {
                            const numberingData = templateFiles.get('word/numbering.xml')!;
                const numberingString = new TextDecoder('utf-8').decode(numberingData);
                // Explicitly remove old numbering.xml if it exists, then add new one
                if (outputZip.file('word/numbering.xml')) {
                    outputZip.remove('word/numbering.xml');
                    console.log('Removed template numbering.xml');
                }
                outputZip.file('word/numbering.xml', numberingString);
                console.log('✅ Added formatted document numbering.xml (preserves bullets)');
                console.log('Numbering.xml preview:', numberingString.substring(0, 500));
                
                // Verify numbering.xml contains bullet definitions
                if (numberingString.includes('bullet') || numberingString.includes('BULLET') || numberingString.includes('•')) {
                    console.log('✅ Numbering.xml contains bullet definitions');
                } else {
                    console.warn('⚠️ Numbering.xml may not contain bullet definitions');
                }
            } else {
                console.warn('⚠️ No numbering.xml found in templateFiles - bullets may not work');
            }
            
            // Update relationships if modified (ensures numbering.xml is properly referenced)
                        if (templateFiles.has('word/_rels/document.xml.rels')) {
                            const relsData = templateFiles.get('word/_rels/document.xml.rels')!;
                const relsString = new TextDecoder('utf-8').decode(relsData);
                // Explicitly remove old relationships file if it exists, then add new one
                if (outputZip.file('word/_rels/document.xml.rels')) {
                    outputZip.remove('word/_rels/document.xml.rels');
                }
                outputZip.file('word/_rels/document.xml.rels', relsString);
                console.log('Updated relationships file (ensures numbering.xml reference)');
            } else if (templateFiles.has('word/numbering.xml')) {
                // If numbering.xml exists but relationships wasn't updated, ensure it's referenced
                // Read existing relationships from template ZIP
                const existingRels = await outputZip.file('word/_rels/document.xml.rels')?.async('string');
                if (existingRels && !existingRels.includes('numbering.xml')) {
                    // Add numbering relationship if missing
                    const relsEndIndex = existingRels.indexOf('</Relationships>');
                    if (relsEndIndex !== -1) {
                        // Generate a relationship ID (usually rId1, rId2, etc.)
                        const existingIds = existingRels.match(/Id="rId(\d+)"/g) || [];
                        const maxId = existingIds.length > 0 
                            ? Math.max(...existingIds.map(id => parseInt(id.match(/\d+/)?.[0] || '0')))
                            : 0;
                        const newId = `rId${maxId + 1}`;
                        const numberingRel = `    <Relationship Id="${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`;
                        const updatedRels = existingRels.substring(0, relsEndIndex) + 
                                          '\n' + numberingRel + 
                                          '\n' + existingRels.substring(relsEndIndex);
                        outputZip.file('word/_rels/document.xml.rels', updatedRels);
                        console.log('Added numbering relationship to template');
                    }
                }
            }
            
            // All other files (including letterhead images) are already in the template ZIP
            // and will be preserved automatically - no need to manually add them
            
            // Final verification: Check that numbering.xml exists in ZIP before generating
            const numberingFileInZip = outputZip.file('word/numbering.xml');
            if (numberingFileInZip) {
                console.log('✅ Verified numbering.xml exists in ZIP before generation');
            } else {
                console.error('❌ ERROR: numbering.xml NOT found in ZIP before generation!');
            }
            
            // Verify relationships file includes numbering reference
            const relsFileInZip = outputZip.file('word/_rels/document.xml.rels');
            if (relsFileInZip) {
                const relsContent = await relsFileInZip.async('string');
                if (relsContent.includes('numbering.xml')) {
                    console.log('✅ Verified numbering.xml relationship exists in ZIP');
                } else {
                    console.warn('⚠️ WARNING: numbering.xml relationship NOT found in relationships file');
                            }
                        }
                        
                        // Generate final blob
            const finalBlob = await outputZip.generateAsync({ 
                            type: 'blob', 
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        });
                        
                        console.log('Final blob size:', finalBlob.size, 'bytes');
                        
                        // Save file
                        if (typeof saveAs !== 'undefined') {
                            saveAs(finalBlob, filename);
                            console.log('Template populated successfully with formatted content');
                            return;
                        } else {
                            throw new Error('FileSaver.js not loaded');
                        }
        } catch (zipError: any) {
            console.error('Error reconstructing ZIP:', zipError);
            throw new Error(`Failed to reconstruct ZIP file: ${zipError.message}`);
        }
        
    } catch (error: any) {
        console.error('Error populating template:', error);
        throw new Error(`Failed to populate template: ${error.message}`);
    }
};

/**
 * Generate a formatted document blob with header image using docx library
 * This ensures bullets work correctly since everything is generated by the library
 */
async function generateFormattedDocumentBlobWithHeader(text: string, imageDataUri: string, imageFormat: 'png' | 'jpeg'): Promise<Blob> {
    if (typeof docx === 'undefined' || !docx || !docx.Document) {
        throw new Error("Download library (docx) is not loaded.");
    }
    const { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType, NumberFormat, Header, ImageRun, TextWrappingType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionAlign } = docx;
    
    // Generate paragraphs using the same logic as generateFormattedDocumentBlob
    const paragraphs = await generateParagraphsFromText(text);
    
    // Create numbering definition for bullets
    const numbering = {
        config: [
            {
                reference: "bullet-list",
                levels: [
                    {
                        level: 0,
                        format: NumberFormat.BULLET,
                        text: "•",
                        alignment: AlignmentType.LEFT,
                    },
                ],
            },
        ],
    };
    
    // Add letterhead image as background in the header
    // Use pixel dimensions for 8.5" x 11" at 96 DPI
    // 8.5 * 96 = 816 pixels
    // 11 * 96 = 1056 pixels
    const pageWidthPixels = 816;
    const pageHeightPixels = 1056;
    
    console.log(`📐 Setting image size: ${pageWidthPixels} x ${pageHeightPixels} pixels (8.5" x 11")`);
    
    const letterheadImage = new ImageRun({
        data: imageDataUri,
        type: imageFormat,
        transformation: {
            width: pageWidthPixels,
            height: pageHeightPixels,
        },
        floating: {
            horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                align: HorizontalPositionAlign.LEFT,
                offset: 0,
            },
            verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                align: VerticalPositionAlign.TOP,
                offset: 0,
            },
            wrap: {
                type: TextWrappingType.BEHIND, // Place image behind text (background effect)
            },
        },
    });
    
    // Create a paragraph with the background image for the header
    const letterheadParagraph = new Paragraph({
        children: [letterheadImage],
        spacing: { after: 0 },
    });
    
    const doc = new Document({
        numbering: numbering,
        sections: [{ 
            properties: {
                titlePage: true, // Enable different first page header
                page: {
                    margin: {
                        top: 1440, // 1 inch (1440 twips)
                        right: 1440,
                        bottom: 1440,
                        left: 1440,
                    },
                },
            },
            headers: {
                default: new Header({
                    children: [], // No header on subsequent pages
                }),
                first: new Header({
                    children: [letterheadParagraph], // Letterhead only on first page
                }),
            },
            children: paragraphs 
        }],
    });
    
    return await Packer.toBlob(doc);
}

/**
 * Extract paragraph generation logic into reusable function
 */
async function generateParagraphsFromText(text: string): Promise<any[]> {
    if (typeof docx === 'undefined' || !docx || !docx.Document) {
        throw new Error("Download library (docx) is not loaded.");
    }
    const { Paragraph, TextRun, AlignmentType, UnderlineType, NumberFormat } = docx;
    
    const FONT_STYLE = { name: "Times New Roman" };
    const boldAddressLines = [
        "U.S. Department of Homeland Security",
        "Nebraska Services Center",
        "USCIS",
        "850 S St",
        "Lincoln, NE 68508-1225",
        "Attn: I-130 (Box 4053)",
        "2500 Westfield Drive",
        "Elgin, IL 60124-7836"
    ];
    
    const paragraphs: any[] = [];
    const lines = text.split(/\r\n?|\n/);
    let isInAbuseSection = false;
    let lastWasAbuseItem = false;
    
    for (const line of lines) {
        const sanitizedLine = sanitizeXmlString(line);
        
        if (!sanitizedLine.trim()) {
            paragraphs.push(new Paragraph({ 
                children: [new TextRun({ text: " ", font: FONT_STYLE })],
                spacing: { after: 0 }
            }));
            continue;
        }
        
        const trimmedLine = sanitizedLine.trim();
        let textRuns: any[] = [];
        let paragraphOptions: any = {
            spacing: { after: 0 },
            alignment: AlignmentType.JUSTIFIED
        };
        
        let isBold = false;
        let shouldIndent = false;
        const isAbuseCategoryHeader = trimmedLine.startsWith('•') && trimmedLine.includes('<u>') && trimmedLine.includes('Abuse');
        
        if (isAbuseCategoryHeader && isInAbuseSection && lastWasAbuseItem) {
            paragraphOptions.spacing = { before: 200 };
        }
        
        const neverBoldLines = [
            'The Petitioner is eligible to file a self-petition',
            'The petitioner is eligible to file a self-petition',
            'the Petitioner is eligible to file a self-petition',
            'the petitioner is eligible to file a self-petition'
        ];
        const shouldNeverBeBold = neverBoldLines.some(phrase => trimmedLine.includes(phrase));
        
        if (boldAddressLines.some(addressLine => trimmedLine.includes(addressLine))) {
            isBold = true;
        } else if (trimmedLine.match(/^[A-Z]\.\s+\w/)) {
            textRuns.push(new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24, bold: true, underline: { type: UnderlineType.SINGLE, color: "auto" } }));
        } else if (['RE:', 'Petitioner:', 'Beneficiary:', 'DOB:'].some(h => trimmedLine.startsWith(h))) {
            const colonIndex = sanitizedLine.indexOf(':');
            if (colonIndex !== -1) {
                const label = sanitizedLine.substring(0, colonIndex + 1);
                const value = sanitizedLine.substring(colonIndex + 1).trim();
                textRuns.push(new TextRun({ text: sanitizeXmlString(label), font: FONT_STYLE, size: 24, bold: true }));
                if (value) {
                    textRuns.push(new TextRun({ text: ' ' + sanitizeXmlString(value), font: FONT_STYLE, size: 24 }));
                }
                shouldIndent = true;
            } else {
                isBold = true;
                shouldIndent = true;
            }
        } else if (['To Whom It May Concern:', 'Dear', 'Forms:', 'TAB A', 'TAB B', 'TAB C', 'TAB D', 'TAB E', 'TAB F', 'DOCUMENTS ESTABLISHING', 'LEGAL ARGUMENT', 'VAWA I-360 SELF-PETITION', 'Background and Victimization', 'Conclusion', "Attorney's Name", 'Attorney for the Petitioner'].some(h => trimmedLine.startsWith(h)) || /^conclusion\b/i.test(trimmedLine) || trimmedLine === "Attorney's Name" || trimmedLine === 'Attorney for the Petitioner') {
            isBold = true;
        }
        
        if (shouldNeverBeBold) {
            isBold = false;
        }
        
        if (isAbuseCategoryHeader) {
            const titleText = sanitizedLine.replace('•', '').replace(/\*\*<u>/g, '').replace(/<\/u>\*\*/g, '').trim();
            textRuns.push(new TextRun({ text: sanitizeXmlString(titleText), font: FONT_STYLE, size: 24, bold: true, underline: { type: UnderlineType.SINGLE, color: "auto" } }));
            paragraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
            paragraphOptions.spacing = { after: 200 };
            isInAbuseSection = true;
            lastWasAbuseItem = false;
        } else if (trimmedLine.startsWith('•') && trimmedLine.includes('**')) {
            const textWithoutBullet = sanitizedLine.replace('•', '').trim();
            const subtitleMatch = textWithoutBullet.match(/^\*\*(.*?):\*\*/);
            if (subtitleMatch && subtitleMatch[1]) {
                const subtitle = subtitleMatch[1];
                const description = textWithoutBullet.replace(`**${subtitle}:**`, '').trim();
                textRuns.push(new TextRun({ text: sanitizeXmlString(`${subtitle}: `), font: FONT_STYLE, size: 24, bold: true }));
                textRuns.push(new TextRun({ text: sanitizeXmlString(description), font: FONT_STYLE, size: 24 }));
            } else {
                textRuns.push(new TextRun({ text: sanitizeXmlString(textWithoutBullet), font: FONT_STYLE, size: 24 }));
            }
            paragraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
            if (isInAbuseSection) {
                lastWasAbuseItem = true;
            }
        } else if (trimmedLine.startsWith('-')) {
            const bulletText = sanitizedLine.substring(sanitizedLine.indexOf('-') + 1).trim();
            textRuns.push(new TextRun({ text: sanitizeXmlString(bulletText), font: FONT_STYLE, size: 24 }));
            paragraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
        } else if (textRuns.length === 0) {
            textRuns.push(new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24, bold: isBold }));
        }
        
        if (textRuns.length === 0) {
            const fallbackText = sanitizeXmlString(sanitizedLine).trim() || ' ';
            textRuns.push(new TextRun({ text: fallbackText, font: FONT_STYLE, size: 24 }));
        }
        
        const cleanParagraphOptions: any = {
            children: textRuns,
            spacing: paragraphOptions.spacing || {},
            alignment: paragraphOptions.alignment || AlignmentType.JUSTIFIED
        };
        
        if (paragraphOptions.numbering) {
            cleanParagraphOptions.numbering = paragraphOptions.numbering;
        }
        
        if (isAbuseCategoryHeader) {
            cleanParagraphOptions.indent = {
                left: 0,
                hanging: 0
            };
        } else if ((paragraphOptions.numbering) && isInAbuseSection && !isAbuseCategoryHeader) {
            const indentTwipsAbuse = Math.round(0.25 * 1440);
            cleanParagraphOptions.indent = { 
                left: indentTwipsAbuse,
                hanging: indentTwipsAbuse
            };
        } else if (paragraphOptions.numbering && !isInAbuseSection) {
            const indentTwips = Math.round(0.25 * 1440);
            if (!cleanParagraphOptions.indent) {
                cleanParagraphOptions.indent = {
                    left: indentTwips,
                    hanging: indentTwips
                };
            }
        }
        
        if (shouldIndent) {
            const indentTwips = Math.round(0.25 * 1440);
            if (!cleanParagraphOptions.indent) {
                cleanParagraphOptions.indent = { left: indentTwips };
            }
        }
        
        if (cleanParagraphOptions.children && cleanParagraphOptions.children.length > 0) {
            try {
                paragraphs.push(new Paragraph(cleanParagraphOptions));
            } catch (e) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24 })],
                    alignment: AlignmentType.JUSTIFIED
                }));
            }
        }
    }
    
    return paragraphs;
}

/**
 * Generate a formatted document blob using the same logic as downloadDocx
 * This preserves ALL formatting (bold, indentation, bullets, etc.)
 */
async function generateFormattedDocumentBlob(text: string): Promise<Blob> {
    // Use the same formatting logic as downloadDocx
    // This is a duplicate of the logic, but it's necessary to generate the blob
    if (typeof docx === 'undefined' || !docx || !docx.Document) {
        throw new Error("Download library (docx) is not loaded.");
    }
    const { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType, NumberFormat } = docx;
    
    const FONT_STYLE = { name: "Times New Roman" };
    const boldAddressLines = [
        "U.S. Department of Homeland Security",
        "Nebraska Services Center",
        "USCIS",
        "850 S St",
        "Lincoln, NE 68508-1225",
        "Attn: I-130 (Box 4053)",
        "2500 Westfield Drive",
        "Elgin, IL 60124-7836"
    ];
    
    const paragraphs: any[] = [];
    const lines = text.split(/\r\n?|\n/);
    let isInAbuseSection = false;
    let lastWasAbuseItem = false;
    
    for (const line of lines) {
        const sanitizedLine = sanitizeXmlString(line);
        
        if (!sanitizedLine.trim()) {
            paragraphs.push(new Paragraph({ 
                children: [new TextRun({ text: " ", font: FONT_STYLE })],
                spacing: { after: 0 }
            }));
            continue;
        }
        
        const trimmedLine = sanitizedLine.trim();
        let textRuns: any[] = [];
        let paragraphOptions: any = {
            spacing: { after: 0 },
            alignment: AlignmentType.JUSTIFIED
        };
        
        let isBold = false;
        let shouldIndent = false;
        const isAbuseCategoryHeader = trimmedLine.startsWith('•') && trimmedLine.includes('<u>') && trimmedLine.includes('Abuse');
        
        if (isAbuseCategoryHeader && isInAbuseSection && lastWasAbuseItem) {
            paragraphOptions.spacing = { before: 200 };
        }
        
        const neverBoldLines = [
            'The Petitioner is eligible to file a self-petition',
            'The petitioner is eligible to file a self-petition',
            'the Petitioner is eligible to file a self-petition',
            'the petitioner is eligible to file a self-petition'
        ];
        const shouldNeverBeBold = neverBoldLines.some(phrase => trimmedLine.includes(phrase));
        
        if (boldAddressLines.some(addressLine => trimmedLine.includes(addressLine))) {
            isBold = true;
        } else if (trimmedLine.match(/^[A-Z]\.\s+\w/)) {
            textRuns.push(new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24, bold: true, underline: { type: UnderlineType.SINGLE, color: "auto" } }));
        } else if (['RE:', 'Petitioner:', 'Beneficiary:', 'DOB:'].some(h => trimmedLine.startsWith(h))) {
            // Split these lines at the colon: label (bold) + value (not bold)
            const colonIndex = sanitizedLine.indexOf(':');
            if (colonIndex !== -1) {
                const label = sanitizedLine.substring(0, colonIndex + 1); // Include the colon
                const value = sanitizedLine.substring(colonIndex + 1).trim();
                textRuns.push(new TextRun({ text: sanitizeXmlString(label), font: FONT_STYLE, size: 24, bold: true }));
                if (value) {
                    textRuns.push(new TextRun({ text: ' ' + sanitizeXmlString(value), font: FONT_STYLE, size: 24 }));
                }
                shouldIndent = true;
            } else {
                // Fallback: if no colon found, bold the whole line
                isBold = true;
                shouldIndent = true;
            }
        } else if (['To Whom It May Concern:', 'Dear', 'Forms:', 'TAB A', 'TAB B', 'TAB C', 'TAB D', 'TAB E', 'TAB F', 'DOCUMENTS ESTABLISHING', 'LEGAL ARGUMENT', 'VAWA I-360 SELF-PETITION', 'Background and Victimization', 'Conclusion', "Attorney's Name", 'Attorney for the Petitioner'].some(h => trimmedLine.startsWith(h)) || /^conclusion\b/i.test(trimmedLine) || trimmedLine === "Attorney's Name" || trimmedLine === 'Attorney for the Petitioner') {
            isBold = true;
        }
        
        if (shouldNeverBeBold) {
            isBold = false;
        }
        
        if (isAbuseCategoryHeader) {
            const titleText = sanitizedLine.replace('•', '').replace(/\*\*<u>/g, '').replace(/<\/u>\*\*/g, '').trim();
            textRuns.push(new TextRun({ text: sanitizeXmlString(titleText), font: FONT_STYLE, size: 24, bold: true, underline: { type: UnderlineType.SINGLE, color: "auto" } }));
            paragraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
            paragraphOptions.spacing = { after: 200 };
            isInAbuseSection = true;
            lastWasAbuseItem = false;
        } else if (trimmedLine.startsWith('•') && trimmedLine.includes('**')) {
            const textWithoutBullet = sanitizedLine.replace('•', '').trim();
            const subtitleMatch = textWithoutBullet.match(/^\*\*(.*?):\*\*/);
            if (subtitleMatch && subtitleMatch[1]) {
                const subtitle = subtitleMatch[1];
                const description = textWithoutBullet.replace(`**${subtitle}:**`, '').trim();
                textRuns.push(new TextRun({ text: sanitizeXmlString(`${subtitle}: `), font: FONT_STYLE, size: 24, bold: true }));
                textRuns.push(new TextRun({ text: sanitizeXmlString(description), font: FONT_STYLE, size: 24 }));
            } else {
                textRuns.push(new TextRun({ text: sanitizeXmlString(textWithoutBullet), font: FONT_STYLE, size: 24 }));
            }
            paragraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
            if (isInAbuseSection) {
                lastWasAbuseItem = true;
            }
        } else if (trimmedLine.startsWith('-')) {
            const bulletText = sanitizedLine.substring(sanitizedLine.indexOf('-') + 1).trim();
            textRuns.push(new TextRun({ text: sanitizeXmlString(bulletText), font: FONT_STYLE, size: 24 }));
            paragraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
        } else if (textRuns.length === 0) {
            textRuns.push(new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24, bold: isBold }));
        }
        
        if (textRuns.length === 0) {
            const fallbackText = sanitizeXmlString(sanitizedLine).trim() || ' ';
            textRuns.push(new TextRun({ text: fallbackText, font: FONT_STYLE, size: 24 }));
        }
        
        const cleanParagraphOptions: any = {
            children: textRuns,
            spacing: paragraphOptions.spacing || {},
            alignment: paragraphOptions.alignment || AlignmentType.JUSTIFIED
        };
        
        if (paragraphOptions.bullet) {
            cleanParagraphOptions.numbering = {
                reference: "bullet-list",
                level: 0
            };
        }
        if (paragraphOptions.numbering) {
            cleanParagraphOptions.numbering = paragraphOptions.numbering;
        }
        
        // Category headers (Psychological Abuse, Verbal Abuse, etc.) should have NO indentation
        if (isAbuseCategoryHeader) {
            cleanParagraphOptions.indent = {
                left: 0, // No indentation for category headers
                hanging: 0
            };
        }
        // Add 0.25 inch indentation for abuse bullet items under abuse headers
        // Set hanging indent to align text with bullet (no tab between bullet and text)
        else if ((paragraphOptions.bullet || paragraphOptions.numbering) && isInAbuseSection && !isAbuseCategoryHeader) {
            const indentTwipsAbuse = Math.round(0.25 * 1440); // 360 twips = 0.25 inches
            cleanParagraphOptions.indent = { 
                left: indentTwipsAbuse,
                hanging: indentTwipsAbuse // Hanging indent aligns text with bullet (no tab)
            };
        }
        // For all bullet items (not just abuse section), ensure 0.25 inch indent with no tab
        else if (paragraphOptions.numbering && !isInAbuseSection) {
            const indentTwips = Math.round(0.25 * 1440); // 360 twips = 0.25 inches
            if (!cleanParagraphOptions.indent) {
                cleanParagraphOptions.indent = {
                    left: indentTwips,
                    hanging: indentTwips // Hanging indent aligns text with bullet (no tab)
                };
            }
        }
        
        if (shouldIndent) {
            const indentTwips = Math.round(0.25 * 1440);
            cleanParagraphOptions.indent = { left: indentTwips };
        }
        
        if (cleanParagraphOptions.children && cleanParagraphOptions.children.length > 0) {
            try {
                paragraphs.push(new Paragraph(cleanParagraphOptions));
            } catch (e) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24 })],
                    alignment: AlignmentType.JUSTIFIED
                }));
            }
        }
    }
    
    // Create numbering definition for bullets
    // Use the docx library's numbering API to create bullet points
    // Indentation is controlled at paragraph level, not numbering level
    const numbering = {
        config: [
            {
                reference: "bullet-list",
                levels: [
                    {
                        level: 0,
                        format: NumberFormat.BULLET,
                        text: "•",
                        alignment: AlignmentType.LEFT,
                    },
                ],
            },
        ],
    };
    
    const doc = new Document({
        numbering: numbering,
        sections: [{ children: paragraphs }],
    });
    
    return await Packer.toBlob(doc);
}

/**
 * Convert text content to Word XML format with proper formatting
 * This is a simplified version - for full formatting, we'd need to replicate
 * the downloadDocx formatting logic in XML format
 */
async function convertTextToWordXml(text: string): Promise<string> {
    // For now, create simple paragraphs - we can enhance this later
    const lines = text.split(/\r\n?|\n/);
    let xml = '';
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            // Escape XML special characters
            const escaped = trimmed
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
            
            xml += `<w:p><w:r><w:t>${escaped}</w:t></w:r></w:p>`;
        } else {
            // Empty line
            xml += '<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>';
        }
    }
    
    return xml;
}

export const downloadDocx = async (text: string, filename: string, templateFile?: File) => {
    if (!text) {
        alert("Nothing to download.");
        return;
    }
    
    // If a template file is provided, use it instead of generating from scratch
    if (templateFile) {
        console.log('Using template file:', templateFile.name);
        try {
            await populateWordTemplate(templateFile, text, filename);
            console.log('Template populated successfully');
            return;
        } catch (error: any) {
            console.error('Failed to populate template, falling back to standard generation:', error);
            alert(`Failed to use template: ${error.message}. Generating standard document instead.`);
            // Fall through to standard generation
        }
    } else {
        console.log('No template file provided, generating standard document');
    }
    
    try {
        if (typeof docx === 'undefined' || !docx || !docx.Document) {
            throw new Error("Download library (docx) is not loaded.");
        }
        const { Document, Packer, Paragraph, TextRun, AlignmentType, UnderlineType, Header, ImageRun, TextWrappingType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionAlign, PageBreak, NumberFormat } = docx;
        
        // Debug: Check what's actually available in the docx library
        console.log('docx object keys:', Object.keys(docx).slice(0, 20));
        console.log('HorizontalPositionRelativeFrom:', HorizontalPositionRelativeFrom);
        console.log('VerticalPositionRelativeFrom:', VerticalPositionRelativeFrom);

        // FIX: Define font style as an object to prevent potential shorthand parsing issues in the docx library.
        const FONT_STYLE = { name: "Times New Roman" };
        
        // Lines that should be bolded if they appear in the text
        const boldAddressLines = [
            "U.S. Department of Homeland Security",
            "Nebraska Services Center",
            "USCIS",
            "850 S St",
            "Lincoln, NE 68508-1225",
            "Attn: I-130 (Box 4053)",
            "2500 Westfield Drive",
            "Elgin, IL 60124-7836"
        ];
        
        const paragraphs: any[] = [];
        const lines = text.split(/\r\n?|\n/);
        let isInAbuseSection = false;
        let lastWasAbuseItem = false;
        
        for (const line of lines) {
            const sanitizedLine = sanitizeXmlString(line);

            // FIX: Explicitly handle empty lines to avoid passing them to complex parsing logic.
            // Create a paragraph with an empty text run to preserve spacing.
            if (!sanitizedLine.trim()) {
                paragraphs.push(new Paragraph({ 
                    children: [new TextRun({ text: " ", font: FONT_STYLE })],
                    spacing: { after: 0 }
                }));
                continue;
            }
            
            const trimmedLine = sanitizedLine.trim();
            let textRuns: any[] = [];
            let paragraphOptions: any = {
                spacing: { after: 0 },
                alignment: AlignmentType.JUSTIFIED
            };

            let isBold = false;
            let shouldIndent = false;
            const isAbuseCategoryHeader = trimmedLine.startsWith('•') && trimmedLine.includes('<u>') && trimmedLine.includes('Abuse');
            
            // Lines that should NEVER be bolded (even if they match other patterns)
            const neverBoldLines = [
                'The Petitioner is eligible to file a self-petition',
                'The petitioner is eligible to file a self-petition',
                'the Petitioner is eligible to file a self-petition',
                'the petitioner is eligible to file a self-petition'
            ];
            const shouldNeverBeBold = neverBoldLines.some(phrase => trimmedLine.includes(phrase));
            
            // Add spacing before new abuse category headers (except the first one)
            if (isAbuseCategoryHeader && isInAbuseSection && lastWasAbuseItem) {
                paragraphOptions.spacing = { before: 200 };
            }

            // Check if the current line is one of the address lines to be bolded
            if (boldAddressLines.some(addressLine => trimmedLine.includes(addressLine))) {
                isBold = true;
            } else if (trimmedLine.match(/^[A-Z]\.\s+\w/)) { // Legal Argument Headers (A., B., C.)
                 textRuns.push(new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24, bold: true, underline: { type: UnderlineType.SINGLE, color: "auto" } }));
            } else if (['RE:', 'Petitioner:', 'Beneficiary:', 'DOB:'].some(h => trimmedLine.startsWith(h))) {
                // Split these lines at the colon: label (bold) + value (not bold)
                const colonIndex = sanitizedLine.indexOf(':');
                if (colonIndex !== -1) {
                    const label = sanitizedLine.substring(0, colonIndex + 1); // Include the colon
                    const value = sanitizedLine.substring(colonIndex + 1).trim();
                    textRuns.push(new TextRun({ text: sanitizeXmlString(label), font: FONT_STYLE, size: 24, bold: true }));
                    if (value) {
                        textRuns.push(new TextRun({ text: ' ' + sanitizeXmlString(value), font: FONT_STYLE, size: 24 }));
                    }
                    shouldIndent = true;
                } else {
                    // Fallback: if no colon found, bold the whole line
                    isBold = true;
                    shouldIndent = true;
                }
            } else if (['To Whom It May Concern:', 'Dear', 'Forms:', 'TAB A', 'TAB B', 'TAB C', 'TAB D', 'TAB E', 'TAB F', 'DOCUMENTS ESTABLISHING', 'LEGAL ARGUMENT', 'VAWA I-360 SELF-PETITION', 'Background and Victimization', 'Conclusion', "Attorney's Name", 'Attorney for the Petitioner'].some(h => trimmedLine.startsWith(h)) || /^conclusion\b/i.test(trimmedLine) || trimmedLine === "Attorney's Name" || trimmedLine === 'Attorney for the Petitioner') {
                isBold = true; // Always bold "Conclusion" heading (case-insensitive) and attorney signature lines
            }
            
            // Override: If line should never be bolded, force isBold to false
            if (shouldNeverBeBold) {
                isBold = false;
            }

            if (isAbuseCategoryHeader) {
                const titleText = sanitizedLine.replace('•', '').replace(/\*\*<u>/g, '').replace(/<\/u>\*\*/g, '').trim();
                textRuns.push(new TextRun({ text: sanitizeXmlString(titleText), font: FONT_STYLE, size: 24, bold: true, underline: { type: UnderlineType.SINGLE, color: "auto" } }));
                paragraphOptions.numbering = {
                    reference: "bullet-list",
                    level: 0
                };
                // Add space after each abuse category header
                paragraphOptions.spacing = { after: 200 };
                isInAbuseSection = true;
                lastWasAbuseItem = false;
            } else if (trimmedLine.startsWith('•') && trimmedLine.includes('**')) {
                const textWithoutBullet = sanitizedLine.replace('•', '').trim();
                const subtitleMatch = textWithoutBullet.match(/^\*\*(.*?):\*\*/);
                if (subtitleMatch && subtitleMatch[1]) {
                    const subtitle = subtitleMatch[1];
                    const description = textWithoutBullet.replace(`**${subtitle}:**`, '').trim();
                    textRuns.push(new TextRun({ text: sanitizeXmlString(`${subtitle}: `), font: FONT_STYLE, size: 24, bold: true }));
                    textRuns.push(new TextRun({ text: sanitizeXmlString(description), font: FONT_STYLE, size: 24 }));
                } else {
                    textRuns.push(new TextRun({ text: sanitizeXmlString(textWithoutBullet), font: FONT_STYLE, size: 24 }));
                }
                paragraphOptions.numbering = {
                    reference: "bullet-list",
                    level: 0
                };
                // Track that this is an abuse item (used for spacing before next category)
                if (isInAbuseSection) {
                    lastWasAbuseItem = true;
                }
            } else if (trimmedLine.startsWith('-')) {
                const bulletText = sanitizedLine.substring(sanitizedLine.indexOf('-') + 1).trim();
                textRuns.push(new TextRun({ text: sanitizeXmlString(bulletText), font: FONT_STYLE, size: 24 }));
                paragraphOptions.numbering = {
                    reference: "bullet-list",
                    level: 0
                };
            } else if (textRuns.length === 0) { // If not already handled by other logic
                 textRuns.push(new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24, bold: isBold }));
            }

            // Ensure paragraph always has at least one valid text run
            if (textRuns.length === 0) {
                // Fallback: create a simple text run
                const fallbackText = sanitizeXmlString(sanitizedLine).trim() || ' ';
                textRuns.push(new TextRun({ text: fallbackText, font: FONT_STYLE, size: 24 }));
            }
            
            // Clean up paragraph options - remove undefined values that might cause issues
            const cleanParagraphOptions: any = {
                children: textRuns,
                spacing: paragraphOptions.spacing || {},
                alignment: paragraphOptions.alignment || AlignmentType.JUSTIFIED
            };
            
            if (paragraphOptions.bullet) {
                cleanParagraphOptions.numbering = {
                    reference: "bullet-list",
                    level: 0
                };
            }
            if (paragraphOptions.numbering) {
                cleanParagraphOptions.numbering = paragraphOptions.numbering;
            }

            // Category headers (Psychological Abuse, Verbal Abuse, etc.) should have NO indentation
            if (isAbuseCategoryHeader) {
                cleanParagraphOptions.indent = {
                    left: 0, // No indentation for category headers
                    hanging: 0
                };
            }
            // Add 0.25 inch indentation for abuse bullet items under abuse headers
            // Set hanging indent to align text with bullet (no tab between bullet and text)
            else if ((paragraphOptions.bullet || paragraphOptions.numbering) && isInAbuseSection && !isAbuseCategoryHeader) {
                const indentTwipsAbuse = Math.round(0.25 * 1440); // 360 twips = 0.25 inches
                cleanParagraphOptions.indent = {
                    left: indentTwipsAbuse,
                    hanging: indentTwipsAbuse // Hanging indent aligns text with bullet (no tab)
                };
            }
            // For all bullet items (not just abuse section), ensure 0.25 inch indent with no tab
            else if (paragraphOptions.numbering && !isInAbuseSection && !cleanParagraphOptions.indent) {
                const indentTwips = Math.round(0.25 * 1440); // 360 twips = 0.25 inches
                cleanParagraphOptions.indent = {
                    left: indentTwips,
                    hanging: indentTwips // Hanging indent aligns text with bullet (no tab)
                };
            }
            
            // Add 0.25 inch indentation for specific lines (RE:, Petitioner:, Beneficiary:, DOB:)
            if (shouldIndent) {
                // Convert 0.25 inches to twips (docx.js uses twips: 1 inch = 1440 twips)
                const indentTwips = Math.round(0.25 * 1440); // 360 twips = 0.25 inches
                // Don't override bullet indentation if already set
                if (!cleanParagraphOptions.indent) {
                    cleanParagraphOptions.indent = {
                        left: indentTwips
                    };
                }
            }
            
            // Only add paragraph if it has valid children
            if (cleanParagraphOptions.children && cleanParagraphOptions.children.length > 0) {
                try {
                    const paragraph = new Paragraph(cleanParagraphOptions);
                    paragraphs.push(paragraph);
                } catch (e) {
                    console.error('Error creating paragraph:', e);
                    console.error('Paragraph options:', cleanParagraphOptions);
                    // Fallback: create simple paragraph
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: sanitizeXmlString(sanitizedLine), font: FONT_STYLE, size: 24 })],
                        alignment: AlignmentType.JUSTIFIED
                    }));
                }
            } else {
                // Fallback for empty paragraphs
                console.warn('Paragraph has no children, using fallback');
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: ' ', font: FONT_STYLE })],
                    alignment: AlignmentType.JUSTIFIED
                }));
            }
        }


        // Validate paragraphs before creating document
        if (!paragraphs || paragraphs.length === 0) {
            throw new Error('No valid paragraphs to create document');
        }
        
        console.log(`Total paragraphs created: ${paragraphs.length}`);
        
        // Debug: Check first few paragraphs
        if (paragraphs.length > 0) {
            console.log('First paragraph structure:', {
                hasChildren: paragraphs[0]?.children !== undefined,
                childrenLength: paragraphs[0]?.children?.length,
                paragraphType: paragraphs[0]?.constructor?.name
            });
        }
        
        // Don't filter - use all paragraphs as-is
        // The docx library will handle validation internally
        const validParagraphs = paragraphs;
        
        if (validParagraphs.length === 0) {
            throw new Error('No paragraphs to create document');
        }
        
        console.log(`Creating document with ${validParagraphs.length} paragraphs`);

        // Create document sections - simple structure
        const sections: any[] = [];
        sections.push({ children: validParagraphs });

        // Create numbering definition for bullets (same as generateFormattedDocumentBlob)
        // Indentation is controlled at paragraph level, not numbering level
        const numbering = {
            config: [
                {
                    reference: "bullet-list",
                    levels: [
                        {
                            level: 0,
                            format: NumberFormat.BULLET,
                            text: "•",
                            alignment: AlignmentType.LEFT,
                        },
                    ],
                },
            ],
        };

        const doc = new Document({
            numbering: numbering,
            sections: sections,
        });

        console.log('Document created, generating blob...');
        const blob = await Packer.toBlob(doc);
        console.log('Blob created, size:', blob.size, 'bytes');
        saveAs(blob, filename);
        console.log('Document saved successfully');

    } catch (error: any) {
        console.error("Error in downloadDocx function:", error);
        alert(`Error creating .docx file: ${error.message}`);
    }
};