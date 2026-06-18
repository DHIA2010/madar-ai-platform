import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const items = [
    {
        value: "item-1",
        trigger: "How do I reset my password?",
        content:
            "If you’ve forgotten your password or simply want to reset it for security reasons, the process is straightforward. On the login page, click the “Forgot Password” link. You’ll be prompted to enter the email address associated with your account. Once submitted, our system will send you a secure link to reset your password. This link is valid for 24 hours, so be sure to act promptly. If you don’t see the email, check your spam or junk folder. For added protection, we recommend choosing a strong password that includes a mix of letters, numbers, and symbols. Resetting your password does not affect your account data or subscription settings. If you encounter issues, you can always reach out to our support team for assistance. Keeping your login credentials secure ensures uninterrupted access to your account and protects your personal information.",
    },
    {
        value: "item-2",
        trigger: "Can I change my subscription plan?",
        content:
            "Flexibility is built into our subscription system, allowing you to adjust your plan whenever your needs change. Whether you want to upgrade to access more features or downgrade to a simpler package, you can do so directly from your account settings. Navigate to the subscription section, select the plan that best suits you, and confirm the change. Any adjustments will take effect in your next billing cycle, meaning you won’t lose access to your current plan until the cycle ends. This ensures a smooth transition without interruptions. If you upgrade, you’ll immediately gain access to the new features, while downgrades will reflect after the billing period concludes. Our goal is to give you complete control over your subscription, so you can tailor it to your evolving requirements. Should you need guidance, our support team is available to walk you through the process step by step.",
    },
    {
        value: "item-3",
        trigger: "What payment methods do you accept?",
        content:
            "We strive to make payments as convenient and secure as possible by offering multiple options. You can pay using all major credit cards, including Visa, MasterCard, and American Express. For those who prefer digital wallets, PayPal is fully supported, providing a quick and trusted way to complete transactions. Additionally, we accept bank transfers, which may be ideal for larger payments or corporate accounts. All transactions are processed through our trusted payment partners, ensuring encryption and compliance with industry security standards. This means your financial information is protected at every step. You can manage your payment preferences in your account settings, where you’ll also find options to update billing details or switch methods. If a payment fails, you’ll be notified immediately with instructions to resolve the issue. Our diverse payment options are designed to give you flexibility and peace of mind when managing your subscription.",
    },
]

export function BasicAccordion() {
    return (
        <div>
            <h3 className="text-lg font-medium mb-4">Basic Accordion</h3>
            <Accordion
                type="single"
                collapsible
                defaultValue="item-1"
                className="w-full bg-muted/50 px-6 rounded-lg"
            >
                {items.map((item) => (
                    <AccordionItem key={item.value} value={item.value}>
                        <AccordionTrigger className="text-md">{item.trigger}</AccordionTrigger>
                        <AccordionContent className="text-md">{item.content}</AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    )
}
