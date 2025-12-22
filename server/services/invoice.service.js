import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Invoice Generation Service
 */
class InvoiceService {
  
  /**
   * Generate invoice PDF
   */
  async generateInvoicePDF(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const fileName = `invoice_${invoiceData.invoiceNumber}.pdf`;
        const uploadDir = path.join(process.cwd(), 'uploads', 'invoices');
        
        // Create directory if not exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filePath = path.join(uploadDir, fileName);
        const writeStream = fs.createWriteStream(filePath);

        doc.pipe(writeStream);

        // Header
        this.generateHeader(doc, invoiceData);
        
        // Customer & Invoice Info
        this.generateCustomerInformation(doc, invoiceData);
        
        // Line Items
        this.generateInvoiceTable(doc, invoiceData);
        
        // Footer
        this.generateFooter(doc, invoiceData);

        doc.end();

        writeStream.on('finish', () => {
          resolve({
            success: true,
            filePath: filePath,
            fileName: fileName,
            url: `/uploads/invoices/${fileName}`
          });
        });

        writeStream.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        console.error('Invoice PDF generation error:', error);
        reject(error);
      }
    });
  }

  /**
   * Generate header with logo and company details
   */
  generateHeader(doc, invoice) {
    const company = invoice.companyDetails || {};
    
    doc
      .fontSize(20)
      .text('MEDICZY', 50, 45)
      .fontSize(10)
      .text(company.name || 'Mediczy Healthcare', 50, 70)
      .text(company.address || '', 50, 85)
      .text(`GSTIN: ${company.gstin || ''}`, 50, 100)
      .text(`Email: ${company.email || ''}`, 50, 115)
      .text(`Phone: ${company.phone || ''}`, 50, 130)
      .moveDown();

    // Invoice title
    doc
      .fontSize(20)
      .text('INVOICE', 400, 45, { align: 'right' })
      .fontSize(10)
      .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 70, { align: 'right' })
      .text(`Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, 400, 85, { align: 'right' });
    
    if (invoice.dueDate) {
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 400, 100, { align: 'right' });
    }

    // Line
    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, 160)
      .lineTo(550, 160)
      .stroke();
  }

  /**
   * Generate customer information
   */
  generateCustomerInformation(doc, invoice) {
    const customer = invoice.customerDetails || {};
    
    doc
      .fontSize(12)
      .text('Bill To:', 50, 180)
      .fontSize(10)
      .text(customer.name || 'N/A', 50, 200)
      .text(customer.email || '', 50, 215)
      .text(customer.phone || '', 50, 230);
    
    if (customer.address) {
      doc.text(customer.address, 50, 245, { width: 200 });
    }

    doc.moveDown();
  }

  /**
   * Generate invoice table with line items
   */
  generateInvoiceTable(doc, invoice) {
    const tableTop = 300;
    const itemCodeX = 50;
    const descriptionX = 150;
    const quantityX = 350;
    const priceX = 420;
    const amountX = 490;

    // Table header
    doc
      .fontSize(10)
      .text('Item', itemCodeX, tableTop, { bold: true })
      .text('Description', descriptionX, tableTop)
      .text('Qty', quantityX, tableTop)
      .text('Price', priceX, tableTop)
      .text('Amount', amountX, tableTop);

    // Line below header
    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Line items
    let yPosition = tableTop + 30;
    const lineItems = invoice.lineItems || [];

    lineItems.forEach((item, index) => {
      doc
        .fontSize(9)
        .text(item.code || (index + 1), itemCodeX, yPosition)
        .text(item.description || item.name || '', descriptionX, yPosition, { width: 180 })
        .text(item.quantity || 1, quantityX, yPosition)
        .text(`${invoice.currency} ${parseFloat(item.price || 0).toFixed(2)}`, priceX, yPosition)
        .text(`${invoice.currency} ${parseFloat(item.amount || 0).toFixed(2)}`, amountX, yPosition);
      
      yPosition += 25;
    });

    // Totals section
    yPosition += 20;
    const subtotalY = yPosition;

    doc
      .fontSize(10)
      .text('Subtotal:', 400, subtotalY)
      .text(`${invoice.currency} ${parseFloat(invoice.subtotal || 0).toFixed(2)}`, 490, subtotalY);

    if (invoice.discount && invoice.discount > 0) {
      doc
        .text('Discount:', 400, subtotalY + 20)
        .text(`- ${invoice.currency} ${parseFloat(invoice.discount).toFixed(2)}`, 490, subtotalY + 20);
      yPosition += 20;
    }

    if (invoice.tax && invoice.tax > 0) {
      doc
        .text('Tax (GST):', 400, subtotalY + 40)
        .text(`${invoice.currency} ${parseFloat(invoice.tax).toFixed(2)}`, 490, subtotalY + 40);
      yPosition += 20;
    }

    // Total
    doc
      .fontSize(12)
      .text('Total:', 400, subtotalY + 60, { bold: true })
      .text(`${invoice.currency} ${parseFloat(invoice.total || 0).toFixed(2)}`, 490, subtotalY + 60);

    // Line above total
    doc
      .strokeColor('#aaaaaa')
      .lineWidth(2)
      .moveTo(400, subtotalY + 55)
      .lineTo(550, subtotalY + 55)
      .stroke();
  }

  /**
   * Generate footer with notes and payment info
   */
  generateFooter(doc, invoice) {
    const footerY = 650;

    if (invoice.notes) {
      doc
        .fontSize(10)
        .text('Notes:', 50, footerY)
        .fontSize(9)
        .text(invoice.notes, 50, footerY + 15, { width: 500 });
    }

    // Footer line
    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, 750)
      .lineTo(550, 750)
      .stroke();

    doc
      .fontSize(8)
      .text('Thank you for your business!', 50, 760, { align: 'center', width: 500 })
      .text('For any queries, contact billing@mediczy.com', 50, 775, { align: 'center', width: 500 });
  }

  /**
   * Generate simple receipt (lighter version)
   */
  async generateReceipt(paymentData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A5', margin: 30 });
        const fileName = `receipt_${paymentData.paymentId}.pdf`;
        const uploadDir = path.join(process.cwd(), 'uploads', 'receipts');
        
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filePath = path.join(uploadDir, fileName);
        const writeStream = fs.createWriteStream(filePath);

        doc.pipe(writeStream);

        // Header
        doc
          .fontSize(16)
          .text('PAYMENT RECEIPT', { align: 'center' })
          .moveDown()
          .fontSize(10)
          .text(`Receipt #: ${paymentData.paymentId}`, { align: 'center' })
          .text(`Date: ${new Date().toLocaleString()}`, { align: 'center' })
          .moveDown();

        // Payment details
        doc
          .fontSize(12)
          .text('Payment Details', { underline: true })
          .moveDown(0.5)
          .fontSize(10)
          .text(`Amount Paid: ${paymentData.currency} ${parseFloat(paymentData.amount).toFixed(2)}`)
          .text(`Payment Method: ${paymentData.method || 'N/A'}`)
          .text(`Status: ${paymentData.status}`)
          .text(`Gateway: ${paymentData.gateway}`)
          .moveDown();

        if (paymentData.customer) {
          doc
            .fontSize(12)
            .text('Customer Details', { underline: true })
            .moveDown(0.5)
            .fontSize(10)
            .text(`Name: ${paymentData.customer.name}`)
            .text(`Email: ${paymentData.customer.email}`)
            .text(`Phone: ${paymentData.customer.phone || 'N/A'}`);
        }

        doc.end();

        writeStream.on('finish', () => {
          resolve({
            success: true,
            filePath: filePath,
            fileName: fileName,
            url: `/uploads/receipts/${fileName}`
          });
        });

        writeStream.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        console.error('Receipt generation error:', error);
        reject(error);
      }
    });
  }
}

export default new InvoiceService();
