import { initChaiBuilderActionHandler } from "@chaibuilder/sdk/actions";
import { NextResponse } from "next/server";
import { updatePages } from "./update-pages";

export * from "@chaibuilder/sdk/actions";
export { updatePages };
export function initChaiBuilderNextJSActionHandler({ apiKey, userId }: { apiKey: string, userId: string }) {
    return async function (body: any) {
        const actionHandler = initChaiBuilderActionHandler({ apiKey, userId })
        const response: any = await actionHandler(body)
        if (response?._streamingResponse && response?._streamResult) {
            const result = response._streamResult;

            if (!result?.textStream) {
                return NextResponse.json({ error: "No streaming response available" }, { status: 500 });
            }

            // Create a ReadableStream for streaming response
            const stream = new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder();
                    try {
                        for await (const chunk of result.textStream) {
                            if (chunk) {
                                controller.enqueue(encoder.encode(chunk));
                            }
                        }
                        controller.close();
                    } catch (error) {
                        controller.error(error);
                    }
                },
            });

            return new Response(stream, {
                headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
            });
        }

        return NextResponse.json(response, { status: response.status || 200 });
    }
}